import type { Platform } from "../env";

export interface PublishOutcome {
  platform: Platform;
  status: "ok" | "error" | "skipped";
  externalId?: string;
  externalUrl?: string;
  message?: string;
}

export function ok(
  platform: Platform,
  externalId?: string,
  externalUrl?: string,
): PublishOutcome {
  return { platform, status: "ok", externalId, externalUrl };
}

export function skipped(platform: Platform, message: string): PublishOutcome {
  return { platform, status: "skipped", message };
}

export function failed(platform: Platform, message: string): PublishOutcome {
  return { platform, status: "error", message: message.slice(0, 2000) };
}

/** Turns any thrown value into a one-line message fit for the dashboard. */
export function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return "unknown error";
  }
}

/**
 * Reads a fetch Response and throws a message that includes the API's own error
 * body. Without the body, a Graph API or LinkedIn failure is unreadable.
 */
export async function expectOk(
  response: Response,
  label: string,
): Promise<unknown> {
  const text = await response.text();
  let parsed: unknown = text;
  try {
    parsed = text.length > 0 ? JSON.parse(text) : {};
  } catch {
    // Leave it as text; some errors come back as HTML.
  }
  if (!response.ok) {
    const detail = typeof parsed === "string" ? parsed : JSON.stringify(parsed);
    throw new Error(`${label} failed (HTTP ${response.status}): ${detail}`);
  }
  return parsed;
}
