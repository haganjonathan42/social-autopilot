"use client";

import { useActionState } from "react";
import { importNow, signOut, type ActionState } from "../actions";

const initial: ActionState = {};

export function Toolbar({ enabled }: { enabled: string[] }) {
  const [state, action, pending] = useActionState(importNow, initial);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="text-xs" style={{ color: "var(--muted)" }}>
        Publishing to:{" "}
        <strong style={{ color: "var(--text)" }}>
          {enabled.length > 0 ? enabled.join(", ") : "nothing (set ENABLED_PLATFORMS)"}
        </strong>
      </span>
      <form action={action}>
        <button className="btn" type="submit" disabled={pending}>
          {pending ? "Importing…" : "Import from GitHub now"}
        </button>
      </form>
      <form action={signOut}>
        <button className="btn" type="submit">
          Sign out
        </button>
      </form>
      {state.error ? (
        <span className="text-xs" style={{ color: "var(--err)" }} role="alert">
          {state.error}
        </span>
      ) : null}
      {state.notice ? (
        <span className="text-xs" style={{ color: "var(--ok)" }} role="status">
          {state.notice}
        </span>
      ) : null}
    </div>
  );
}
