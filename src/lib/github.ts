import { insertDraft } from "./drafts";
import { optional, required } from "./env";
import { validateDraft } from "./types";

interface ContentEntry {
  name: string;
  path: string;
  type: string;
  download_url: string | null;
}

export interface ImportReport {
  scanned: number;
  imported: number;
  duplicates: number;
  invalid: { path: string; errors: string[] }[];
  importedIds: number[];
  /**
   * True when the drafts folder does not exist in the repo. Before the first
   * draft is committed that is normal, but it is also what a typo in
   * GITHUB_DRAFTS_PATH looks like — and the two are indistinguishable from a
   * plain "0 files" result, so say which it was.
   */
  folderMissing: boolean;
}

/**
 * Imports draft JSON files from a folder in the GitHub repo.
 *
 * This is the backup intake path: the daily Claude scheduled task may only be
 * able to reach GitHub, so it commits a JSON file into /drafts and this importer
 * picks it up on the next cron run.
 *
 * Config:
 *   GITHUB_REPO         "owner/name" (e.g. haganjonathan42/social-autopilot)
 *   GITHUB_BRANCH       defaults to "main"
 *   GITHUB_DRAFTS_PATH  defaults to "drafts"
 *   GITHUB_TOKEN        optional for a public repo, required for a private one.
 *                       Also worth setting on a public repo: unauthenticated
 *                       GitHub API calls are limited to 60 requests an hour.
 *
 * Files whose names start with "example" or "_" are treated as templates and
 * skipped.
 *
 * A file's path is its identity, so re-running the import never creates a
 * duplicate, and editing a file after it has been imported does NOT re-import
 * it — edit the draft in the dashboard instead.
 */
export async function importDraftsFromGitHub(): Promise<ImportReport> {
  const repo = required("GITHUB_REPO");
  const branch = optional("GITHUB_BRANCH") ?? "main";
  const folder = (optional("GITHUB_DRAFTS_PATH") ?? "drafts").replace(
    /^\/+|\/+$/g,
    "",
  );
  const token = optional("GITHUB_TOKEN");

  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "social-autopilot",
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const listUrl =
    `https://api.github.com/repos/${repo}/contents/${encodeURI(folder)}` +
    `?ref=${encodeURIComponent(branch)}`;

  const report: ImportReport = {
    scanned: 0,
    imported: 0,
    duplicates: 0,
    invalid: [],
    importedIds: [],
    folderMissing: false,
  };

  const listResponse = await fetch(listUrl, { headers, cache: "no-store" });
  if (listResponse.status === 404) {
    // A missing folder is a normal state. A missing repo is a misconfiguration,
    // and reporting "0 files" for it would hide the real problem — so check.
    const repoResponse = await fetch(`https://api.github.com/repos/${repo}`, {
      headers,
      cache: "no-store",
    });
    if (!repoResponse.ok) {
      throw new Error(
        `Cannot read ${repo} on GitHub (HTTP ${repoResponse.status}). ` +
          `Check GITHUB_REPO, and set GITHUB_TOKEN if the repo is private.`,
      );
    }
    report.folderMissing = true;
    return report;
  }
  if (!listResponse.ok) {
    throw new Error(
      `GitHub listing failed (HTTP ${listResponse.status}): ${await listResponse.text()}`,
    );
  }

  const entries = (await listResponse.json()) as ContentEntry[] | ContentEntry;
  const files = (Array.isArray(entries) ? entries : [entries]).filter((entry) => {
    if (entry.type !== "file") return false;
    const name = entry.name.toLowerCase();
    if (!name.endsWith(".json")) return false;
    // Template and scratch files are not drafts.
    return !name.startsWith("example") && !name.startsWith("_");
  });

  for (const file of files) {
    report.scanned += 1;
    let parsed: unknown;
    try {
      const url =
        file.download_url ??
        `https://raw.githubusercontent.com/${repo}/${branch}/${file.path}`;
      const fileResponse = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        cache: "no-store",
      });
      if (!fileResponse.ok) {
        report.invalid.push({
          path: file.path,
          errors: [`could not read file (HTTP ${fileResponse.status})`],
        });
        continue;
      }
      parsed = JSON.parse(await fileResponse.text());
    } catch (error) {
      report.invalid.push({
        path: file.path,
        errors: [error instanceof Error ? error.message : String(error)],
      });
      continue;
    }

    // A file may hold one draft object or an array of them.
    const items = Array.isArray(parsed) ? parsed : [parsed];
    for (let index = 0; index < items.length; index++) {
      const sourceRef =
        items.length === 1
          ? `github:${file.path}`
          : `github:${file.path}#${index}`;
      const validated = validateDraft(items[index]);
      if (!validated.ok || !validated.value) {
        report.invalid.push({ path: sourceRef, errors: validated.errors });
        continue;
      }
      const result = await insertDraft(validated.value, "github", sourceRef);
      if (result.duplicate) {
        report.duplicates += 1;
      } else if (result.draft) {
        report.imported += 1;
        report.importedIds.push(result.draft.id);
      }
    }
  }

  return report;
}
