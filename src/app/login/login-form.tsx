"use client";

import { useActionState } from "react";
import { signIn, type ActionState } from "../actions";

const initial: ActionState = {};

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(signIn, initial);

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="next" value={next} />
      <label className="text-sm" style={{ color: "var(--muted)" }}>
        Dashboard password
        <input
          className="field mt-1"
          type="password"
          name="password"
          autoComplete="current-password"
          autoFocus
          required
        />
      </label>
      <button className="btn btn-primary" type="submit" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </button>
      {state.error ? (
        <p className="text-sm" style={{ color: "var(--err)" }} role="alert">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
