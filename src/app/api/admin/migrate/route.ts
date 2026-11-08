import { checkCronAuth } from "@/lib/auth";
import { migrate } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Creates or updates the database tables.
 *
 * Run once after the first deploy, and after any schema change:
 *   curl -X POST "https://<app>/api/admin/migrate?secret=$CRON_SECRET"
 *
 * Idempotent, and guarded by CRON_SECRET.
 */
export async function POST(request: Request) {
  if (!checkCronAuth(request)) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  try {
    await migrate();
    return Response.json({ ok: true, message: "schema is up to date" });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}

export const GET = POST;
