import { checkCronAuth } from "@/lib/auth";
import { importDraftsFromGitHub } from "@/lib/github";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Backup intake: imports new JSON files from the repo's /drafts folder.
 *
 * Scheduled in vercel.json for every 15 minutes. Vercel Cron authenticates with
 * `Authorization: Bearer $CRON_SECRET`; `?secret=` is accepted too, so an
 * external scheduler can call it.
 */
export async function GET(request: Request) {
  if (!checkCronAuth(request)) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  try {
    const report = await importDraftsFromGitHub();
    return Response.json({ ok: true, ...report });
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

export const POST = GET;
