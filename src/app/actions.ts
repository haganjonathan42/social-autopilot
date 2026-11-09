"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  SESSION_COOKIE,
  SESSION_COOKIE_OPTIONS,
  checkDashboardPassword,
  createSessionToken,
  requireSession,
} from "@/lib/auth";
import { setStatus, updateDraftText } from "@/lib/drafts";
import { importDraftsFromGitHub } from "@/lib/github";
import { publishDraft } from "@/lib/publish";

export interface ActionState {
  error?: string;
  notice?: string;
}

/** Signs in to the dashboard. */
export async function signIn(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/dashboard");
  if (password.length === 0) {
    return { error: "Enter the dashboard password." };
  }
  try {
    if (!checkDashboardPassword(password)) {
      return { error: "That password is not right." };
    }
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Configuration error",
    };
  }

  const store = await cookies();
  store.set(SESSION_COOKIE, await createSessionToken(), SESSION_COOKIE_OPTIONS);
  // Only same-site paths, so a crafted ?next= cannot send anyone off-site.
  redirect(next.startsWith("/") ? next : "/dashboard");
}

export async function signOut(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  redirect("/login");
}

function draftId(formData: FormData): number {
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id) || id <= 0) throw new Error("Invalid draft id");
  return id;
}

function text(formData: FormData, field: string): string | undefined {
  const value = formData.get(field);
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/** Saves edits to a draft's per-platform text. */
export async function saveDraft(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await requireSession();
    const id = draftId(formData);
    const topic = text(formData, "topic");
    if (!topic) return { error: "Topic cannot be empty." };
    await updateDraftText(id, {
      topic,
      facebook: text(formData, "facebook"),
      instagram: text(formData, "instagram"),
      linkedin: text(formData, "linkedin"),
      x: text(formData, "x"),
      imageUrl: text(formData, "imageUrl"),
      linkUrl: text(formData, "linkUrl"),
    });
    revalidatePath("/dashboard");
    return { notice: "Saved." };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Approves a draft.
 *
 * With no scheduled time, or a time already past, it publishes immediately.
 * With a future time, it is marked approved and the publish-due cron picks it up.
 */
export async function approveDraft(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await requireSession();
    const id = draftId(formData);
    const scheduledRaw = text(formData, "scheduledFor");

    if (scheduledRaw) {
      const when = new Date(scheduledRaw);
      if (Number.isNaN(when.getTime())) {
        return { error: "That scheduled time is not a valid date." };
      }
      if (when.getTime() > Date.now() + 30_000) {
        await setStatus(id, "approved", when.toISOString());
        revalidatePath("/dashboard");
        return {
          notice: `Scheduled for ${when.toLocaleString()}. The cron job will publish it.`,
        };
      }
    }

    await setStatus(id, "approved", null);
    const report = await publishDraft(id);
    revalidatePath("/dashboard");

    const published = report.outcomes
      .filter((o) => o.status === "ok")
      .map((o) => o.platform);
    const errors = report.outcomes.filter((o) => o.status === "error");
    if (errors.length > 0) {
      return {
        error:
          `Published to ${published.join(", ") || "nothing"}. ` +
          errors.map((o) => `${o.platform}: ${o.message}`).join(" | "),
      };
    }
    return {
      notice:
        published.length > 0
          ? `Published to ${published.join(", ")}.`
          : (report.note ?? "Nothing was published."),
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

/** Publishes now, whatever the schedule says. Also used to retry a failure. */
export async function publishNow(
  previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const data = new FormData();
  data.set("id", String(formData.get("id") ?? ""));
  return approveDraft(previous, data);
}

export async function rejectDraft(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await requireSession();
    await setStatus(draftId(formData), "rejected", null);
    revalidatePath("/dashboard");
    return { notice: "Rejected." };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

export async function reopenDraft(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await requireSession();
    await setStatus(draftId(formData), "pending");
    revalidatePath("/dashboard");
    return { notice: "Back in the queue." };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

/** Runs the GitHub /drafts import on demand, without waiting for the cron. */
export async function importNow(
  _previous: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  try {
    await requireSession();
    const report = await importDraftsFromGitHub();
    revalidatePath("/dashboard");
    if (report.folderMissing) {
      return {
        error:
          `The folder "${process.env.GITHUB_DRAFTS_PATH ?? "drafts"}" does not ` +
          `exist in ${process.env.GITHUB_REPO} on branch ` +
          `${process.env.GITHUB_BRANCH ?? "main"}. That is expected before the ` +
          `first draft is committed; otherwise check GITHUB_DRAFTS_PATH.`,
      };
    }
    const invalid =
      report.invalid.length > 0
        ? ` ${report.invalid.length} file(s) were invalid: ` +
          report.invalid
            .map((i) => `${i.path} (${i.errors.join("; ")})`)
            .join(", ")
        : "";
    return {
      notice:
        `Scanned ${report.scanned} file(s): ${report.imported} imported, ` +
        `${report.duplicates} already known.${invalid}`,
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}
