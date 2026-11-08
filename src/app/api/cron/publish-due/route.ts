import { checkCronAuth } from "@/lib/auth";
import { dueDrafts } from "@/lib/drafts";
import { publishDraft } from "@/lib/publish";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Publishes approved drafts whose scheduled time has arrived.
 *
 * Approval without a scheduled time publishes immediately from the dashboard;
 * this endpoint only handles the scheduled ones. Scheduled in vercel.json for
 * every 5 minutes, so a post goes out within 5 minutes of its slot.
 */
export async function GET(request: Request) {
  if (!checkCronAuth(request)) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  try {
    const due = await dueDrafts();
    const reports = [];
    for (const draft of due) {
      reports.push(await publishDraft(draft.id));
    }
    return Response.json({ ok: true, due: due.length, reports });
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
