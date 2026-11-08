"use client";

import { useActionState, useState } from "react";
import {
  approveDraft,
  publishNow,
  reopenDraft,
  rejectDraft,
  saveDraft,
  type ActionState,
} from "../actions";
import type { Draft, PublishLog } from "@/lib/types";
import type { Platform } from "@/lib/env";

const initial: ActionState = {};

const PLATFORM_LABELS: Record<Platform, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  linkedin: "LinkedIn",
  x: "X",
};

const STATUS_COLOR: Record<string, string> = {
  pending: "var(--muted)",
  approved: "var(--accent)",
  publishing: "var(--accent)",
  published: "var(--ok)",
  partial: "var(--warn)",
  failed: "var(--err)",
  rejected: "var(--muted)",
};

function Message({ state }: { state: ActionState }) {
  if (state.error) {
    return (
      <p className="text-sm" style={{ color: "var(--err)" }} role="alert">
        {state.error}
      </p>
    );
  }
  if (state.notice) {
    return (
      <p className="text-sm" style={{ color: "var(--ok)" }} role="status">
        {state.notice}
      </p>
    );
  }
  return null;
}

/** Converts an ISO timestamp into the value a datetime-local input wants. */
function toLocalInputValue(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

function LogRow({ log }: { log: PublishLog }) {
  const color =
    log.status === "ok"
      ? "var(--ok)"
      : log.status === "error"
        ? "var(--err)"
        : "var(--muted)";
  return (
    <li className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 py-1 text-xs">
      <span className="font-mono" style={{ color: "var(--muted)" }}>
        {new Date(log.created_at).toLocaleString()}
      </span>
      <span className="font-semibold">
        {PLATFORM_LABELS[log.platform as Platform] ?? log.platform}
      </span>
      <span style={{ color }}>{log.status}</span>
      {log.external_url ? (
        <a
          href={log.external_url}
          target="_blank"
          rel="noreferrer noopener"
          className="underline"
          style={{ color: "var(--accent)" }}
        >
          view post
        </a>
      ) : null}
      {log.message ? (
        <span className="basis-full break-words" style={{ color: "var(--muted)" }}>
          {log.message}
        </span>
      ) : null}
    </li>
  );
}

export function DraftCard({
  draft,
  logs,
  enabled,
}: {
  draft: Draft;
  logs: PublishLog[];
  enabled: Platform[];
}) {
  const [editing, setEditing] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [saveState, saveAction, saving] = useActionState(saveDraft, initial);
  const [approveState, approveAction, approving] = useActionState(
    approveDraft,
    initial,
  );
  const [publishState, publishAction, publishingNow] = useActionState(
    publishNow,
    initial,
  );
  const [rejectState, rejectAction, rejecting] = useActionState(
    rejectDraft,
    initial,
  );
  const [reopenState, reopenAction, reopening] = useActionState(
    reopenDraft,
    initial,
  );

  const isOpen = draft.status === "pending" || draft.status === "approved";
  const busy = saving || approving || publishingNow || rejecting || reopening;

  const bodies: { platform: Platform; value: string | null }[] = [
    { platform: "facebook", value: draft.facebook },
    { platform: "instagram", value: draft.instagram },
    { platform: "linkedin", value: draft.linkedin },
    { platform: "x", value: draft.x },
  ];

  return (
    <article className="card p-4 sm:p-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold break-words">{draft.topic}</h2>
          <p className="mt-0.5 text-xs" style={{ color: "var(--muted)" }}>
            #{draft.id} · {draft.source} ·{" "}
            {new Date(draft.created_at).toLocaleString()}
            {draft.scheduled_for
              ? ` · scheduled ${new Date(draft.scheduled_for).toLocaleString()}`
              : ""}
          </p>
        </div>
        <span
          className="pill"
          style={{ color: STATUS_COLOR[draft.status] ?? "var(--muted)" }}
        >
          {draft.status}
        </span>
      </header>

      {editing ? (
        <form action={saveAction} className="mt-4 flex flex-col gap-3">
          <input type="hidden" name="id" value={draft.id} />
          <label className="text-xs font-semibold uppercase tracking-wide">
            Topic
            <input className="field mt-1" name="topic" defaultValue={draft.topic} />
          </label>
          {bodies.map(({ platform, value }) => (
            <label
              key={platform}
              className="text-xs font-semibold uppercase tracking-wide"
            >
              {PLATFORM_LABELS[platform]}
              {!enabled.includes(platform) ? (
                <span
                  className="ml-2 font-normal normal-case"
                  style={{ color: "var(--muted)" }}
                >
                  (platform off)
                </span>
              ) : null}
              <textarea
                className="field mt-1 font-normal normal-case"
                name={platform}
                rows={platform === "x" ? 3 : 5}
                defaultValue={value ?? ""}
              />
            </label>
          ))}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-semibold uppercase tracking-wide">
              Image URL (needed for Instagram)
              <input
                className="field mt-1 font-normal normal-case"
                name="imageUrl"
                type="url"
                placeholder="https://…"
                defaultValue={draft.image_url ?? ""}
              />
            </label>
            <label className="text-xs font-semibold uppercase tracking-wide">
              Link URL (kept out of the X post)
              <input
                className="field mt-1 font-normal normal-case"
                name="linkUrl"
                type="url"
                placeholder="https://…"
                defaultValue={draft.link_url ?? ""}
              />
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn btn-primary" type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save changes"}
            </button>
            <button
              className="btn"
              type="button"
              onClick={() => setEditing(false)}
            >
              Done editing
            </button>
            <Message state={saveState} />
          </div>
        </form>
      ) : (
        <div className="mt-4 flex flex-col gap-3">
          {bodies
            .filter((b) => b.value)
            .map(({ platform, value }) => (
              <div key={platform}>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wide">
                    {PLATFORM_LABELS[platform]}
                  </span>
                  {!enabled.includes(platform) ? (
                    <span className="pill" style={{ color: "var(--muted)" }}>
                      off
                    </span>
                  ) : null}
                  {platform === "x" ? (
                    <span className="text-xs" style={{ color: "var(--muted)" }}>
                      {value?.length ?? 0}/280
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 text-sm whitespace-pre-wrap break-words">
                  {value}
                </p>
              </div>
            ))}

          {draft.image_idea ? (
            <p className="text-xs" style={{ color: "var(--muted)" }}>
              <strong>Image idea:</strong> {draft.image_idea}
            </p>
          ) : null}
          {draft.image_url ? (
            <p className="text-xs break-all" style={{ color: "var(--muted)" }}>
              <strong>Image URL:</strong> {draft.image_url}
            </p>
          ) : null}
          {draft.link_url ? (
            <p className="text-xs break-all" style={{ color: "var(--muted)" }}>
              <strong>Link:</strong> {draft.link_url}
            </p>
          ) : null}
        </div>
      )}

      <footer className="mt-4 flex flex-wrap items-center gap-2 border-t pt-3" style={{ borderColor: "var(--border)" }}>
        {isOpen ? (
          <>
            <form action={approveAction} className="flex items-center gap-2">
              <input type="hidden" name="id" value={draft.id} />
              <input
                className="field"
                style={{ width: "13.5rem" }}
                type="datetime-local"
                name="scheduledFor"
                defaultValue={toLocalInputValue(draft.scheduled_for)}
                aria-label="Scheduled time (leave empty to publish now)"
              />
              <button className="btn btn-primary" type="submit" disabled={busy}>
                {approving ? "Working…" : "Approve"}
              </button>
            </form>
            <form action={rejectAction}>
              <input type="hidden" name="id" value={draft.id} />
              <button className="btn btn-danger" type="submit" disabled={busy}>
                {rejecting ? "…" : "Reject"}
              </button>
            </form>
          </>
        ) : (
          <form action={reopenAction}>
            <input type="hidden" name="id" value={draft.id} />
            <button className="btn" type="submit" disabled={busy}>
              {reopening ? "…" : "Back to queue"}
            </button>
          </form>
        )}

        {draft.status === "failed" || draft.status === "partial" ? (
          <form action={publishAction}>
            <input type="hidden" name="id" value={draft.id} />
            <button className="btn" type="submit" disabled={busy}>
              {publishingNow ? "Retrying…" : "Retry publish"}
            </button>
          </form>
        ) : null}

        <button className="btn" type="button" onClick={() => setEditing((v) => !v)}>
          {editing ? "Close editor" : "Edit"}
        </button>

        {logs.length > 0 ? (
          <button
            className="btn"
            type="button"
            onClick={() => setShowLogs((v) => !v)}
          >
            {showLogs ? "Hide log" : `Log (${logs.length})`}
          </button>
        ) : null}
      </footer>

      <div className="mt-2 flex flex-col gap-1">
        <Message state={approveState} />
        <Message state={publishState} />
        <Message state={rejectState} />
        <Message state={reopenState} />
      </div>

      {showLogs && logs.length > 0 ? (
        <ul
          className="mt-3 border-t pt-2"
          style={{ borderColor: "var(--border)" }}
        >
          {logs.map((log) => (
            <LogRow key={log.id} log={log} />
          ))}
        </ul>
      ) : null}
    </article>
  );
}
