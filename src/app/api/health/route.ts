import { query } from "@/lib/db";
import { enabledPlatforms } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Unauthenticated liveness check. Reports no secrets, only whether they exist. */
export async function GET() {
  const configured = {
    database: Boolean(process.env.DATABASE_URL),
    intakeToken: Boolean(process.env.INTAKE_TOKEN),
    dashboardPassword: Boolean(process.env.DASHBOARD_PASSWORD),
    sessionSecret: Boolean(process.env.SESSION_SECRET),
    cronSecret: Boolean(process.env.CRON_SECRET),
    githubRepo: Boolean(process.env.GITHUB_REPO),
    facebook: Boolean(
      process.env.FACEBOOK_PAGE_ID && process.env.FACEBOOK_PAGE_ACCESS_TOKEN,
    ),
  };

  let database = "unknown";
  try {
    await query("SELECT 1");
    database = "ok";
  } catch (error) {
    database = error instanceof Error ? `error: ${error.message}` : "error";
  }

  return Response.json({
    ok: database === "ok",
    database,
    enabledPlatforms: enabledPlatforms(),
    configured,
  });
}
