import { isLoggedIn } from "@/lib/auth";
import { redirect } from "next/navigation";
import { listDrafts, logsForDrafts } from "@/lib/drafts";
import { enabledPlatforms } from "@/lib/env";
import type { Draft, PublishLog } from "@/lib/types";
import { DraftCard } from "./draft-card";
import { Toolbar } from "./toolbar";

export const dynamic = "force-dynamic";

const GROUPS: { title: string; statuses: Draft["status"][] }[] = [
  { title: "Waiting for review", statuses: ["pending"] },
  { title: "Approved and scheduled", statuses: ["approved", "publishing"] },
  { title: "Needs attention", statuses: ["failed", "partial"] },
  { title: "Published", statuses: ["published"] },
  { title: "Rejected", statuses: ["rejected"] },
];

export default async function DashboardPage() {
  // The middleware already gated this route; this is the server-side check.
  if (!(await isLoggedIn())) redirect("/login?next=/dashboard");

  let drafts: Draft[] = [];
  let logs = new Map<number, PublishLog[]>();
  let loadError: string | null = null;

  try {
    drafts = await listDrafts();
    logs = await logsForDrafts(drafts.map((d) => d.id));
  } catch (error) {
    loadError = error instanceof Error ? error.message : String(error);
  }

  const enabled = enabledPlatforms();

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8">
      <header className="mb-6 flex flex-col gap-3">
        <div>
          <h1 className="text-xl font-semibold">social-autopilot</h1>
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            {drafts.length} draft{drafts.length === 1 ? "" : "s"} loaded.
          </p>
        </div>
        <Toolbar enabled={enabled} />
      </header>

      {loadError ? (
        <div className="card p-4" style={{ borderColor: "var(--err)" }}>
          <p className="text-sm font-semibold" style={{ color: "var(--err)" }}>
            Could not load drafts.
          </p>
          <p className="mt-1 text-sm break-words" style={{ color: "var(--muted)" }}>
            {loadError}
          </p>
          <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>
            If this is a fresh deploy, create the tables first:{" "}
            <code>POST /api/admin/migrate?secret=$CRON_SECRET</code>
          </p>
        </div>
      ) : null}

      {!loadError && drafts.length === 0 ? (
        <div className="card p-6">
          <p className="text-sm font-medium">No drafts yet.</p>
          <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
            Send one to <code>POST /api/drafts</code> with your intake token, or
            commit a JSON file into the repo&apos;s <code>/drafts</code> folder
            and use &ldquo;Import from GitHub now&rdquo;. The format is in
            DRAFTS.md.
          </p>
        </div>
      ) : null}

      <div className="flex flex-col gap-8">
        {GROUPS.map((group) => {
          const items = drafts.filter((d) => group.statuses.includes(d.status));
          if (items.length === 0) return null;
          return (
            <section key={group.title}>
              <h2
                className="mb-3 text-xs font-semibold uppercase tracking-wider"
                style={{ color: "var(--muted)" }}
              >
                {group.title} ({items.length})
              </h2>
              <div className="flex flex-col gap-4">
                {items.map((draft) => (
                  <DraftCard
                    key={draft.id}
                    draft={draft}
                    logs={logs.get(draft.id) ?? []}
                    enabled={enabled}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </main>
  );
}
