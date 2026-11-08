import { cookies } from "next/headers";
import { required } from "./env";
import { SESSION_COOKIE, safeEqual, verifySessionToken } from "./session";

export { SESSION_COOKIE, SESSION_COOKIE_OPTIONS, createSessionToken } from "./session";

/** True when the request carries a valid dashboard session cookie. */
export async function isLoggedIn(): Promise<boolean> {
  const store = await cookies();
  return verifySessionToken(store.get(SESSION_COOKIE)?.value);
}

/** Throws unless the caller has a valid dashboard session. */
export async function requireSession(): Promise<void> {
  if (!(await isLoggedIn())) {
    throw new Error("Not signed in");
  }
}

export function checkDashboardPassword(password: string): boolean {
  return safeEqual(password, required("DASHBOARD_PASSWORD"));
}

/**
 * Checks `Authorization: Bearer <token>` against INTAKE_TOKEN.
 * Used by POST /api/drafts, which the daily Claude scheduled task calls.
 */
export function checkBearer(request: Request): boolean {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match) return false;
  return safeEqual(match[1].trim(), required("INTAKE_TOKEN"));
}

/**
 * Authorises a cron endpoint.
 *
 * Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. The same endpoints
 * accept `?secret=` so an external scheduler (or you, by hand) can trigger them.
 */
export function checkCronAuth(request: Request): boolean {
  const secret = required("CRON_SECRET");
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (match && safeEqual(match[1].trim(), secret)) return true;
  const fromQuery = new URL(request.url).searchParams.get("secret");
  return fromQuery !== null && safeEqual(fromQuery, secret);
}
