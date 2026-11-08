import { enabledPlatforms, type Platform } from "../env";
import { addLog, claimForPublishing, setStatus } from "../drafts";
import type { Draft, DraftStatus } from "../types";
import { publishToFacebook } from "./facebook";
import { publishToInstagram } from "./instagram";
import { publishToLinkedIn } from "./linkedin";
import { publishToX } from "./x";
import { describeError, failed, skipped, type PublishOutcome } from "./result";

type Publisher = (draft: Draft) => Promise<PublishOutcome>;

const PUBLISHERS: Record<Platform, Publisher> = {
  facebook: publishToFacebook,
  instagram: publishToInstagram,
  linkedin: publishToLinkedIn,
  x: publishToX,
};

/** Which platforms this draft actually has text for. */
function targetsFor(draft: Draft): Platform[] {
  const hasText: Record<Platform, boolean> = {
    facebook: Boolean(draft.facebook?.trim()),
    instagram: Boolean(draft.instagram?.trim()),
    linkedin: Boolean(draft.linkedin?.trim()),
    x: Boolean(draft.x?.trim()),
  };
  return enabledPlatforms().filter((platform) => hasText[platform]);
}

function finalStatus(outcomes: PublishOutcome[]): DraftStatus {
  const published = outcomes.filter((o) => o.status === "ok").length;
  const errored = outcomes.filter((o) => o.status === "error").length;
  if (published === 0) return errored > 0 ? "failed" : "published";
  return errored > 0 ? "partial" : "published";
}

export interface PublishReport {
  draftId: number;
  status: DraftStatus | "skipped";
  outcomes: PublishOutcome[];
  note?: string;
}

/**
 * Publishes one draft to every enabled platform it has text for.
 *
 * Each platform runs on its own: one failure never stops the others, and every
 * result — success, failure or skip — is written to publish_logs so the
 * dashboard can show what happened.
 *
 * The draft is claimed first with a conditional UPDATE, so two overlapping cron
 * runs cannot publish it twice.
 */
export async function publishDraft(draftId: number): Promise<PublishReport> {
  const draft = await claimForPublishing(draftId);
  if (!draft) {
    return {
      draftId,
      status: "skipped",
      outcomes: [],
      note: "already published or being published by another run",
    };
  }

  const targets = targetsFor(draft);
  if (targets.length === 0) {
    const note =
      "no enabled platform has text for this draft " +
      `(enabled: ${enabledPlatforms().join(", ") || "none"})`;
    await addLog(draft.id, "none", "skipped", { message: note });
    await setStatus(draft.id, "failed");
    return { draftId, status: "failed", outcomes: [], note };
  }

  const outcomes: PublishOutcome[] = [];
  for (const platform of targets) {
    let outcome: PublishOutcome;
    try {
      outcome = await PUBLISHERS[platform](draft);
    } catch (error) {
      // An adapter should return a failure rather than throw, but a thrown
      // error must not take the other platforms down with it.
      outcome = failed(platform, describeError(error));
    }
    outcomes.push(outcome);
    await addLog(draft.id, platform, outcome.status, {
      externalId: outcome.externalId,
      externalUrl: outcome.externalUrl,
      message: outcome.message,
    });
  }

  // Record platforms that were left out, so the dashboard explains the gap.
  for (const platform of enabledPlatforms()) {
    if (!targets.includes(platform)) {
      const outcome = skipped(platform, "no text for this platform on the draft");
      await addLog(draft.id, platform, "skipped", { message: outcome.message });
    }
  }

  const status = finalStatus(outcomes);
  await setStatus(draft.id, status);
  return { draftId, status, outcomes };
}
