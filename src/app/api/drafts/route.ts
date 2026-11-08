import { checkBearer } from "@/lib/auth";
import { insertDraft } from "@/lib/drafts";
import { validateDraft } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Draft intake, primary path.
 *
 *   POST /api/drafts
 *   Authorization: Bearer <INTAKE_TOKEN>
 *   Content-Type: application/json
 *
 * Body: one draft object, or an array of them. See DRAFTS.md for the format.
 *
 * Drafts arrive as `pending` and publish nothing until approved in the
 * dashboard.
 */
export async function POST(request: Request) {
  if (!checkBearer(request)) {
    return Response.json(
      { ok: false, error: "unauthorized" },
      { status: 401, headers: { "WWW-Authenticate": "Bearer" } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { ok: false, error: "body must be valid JSON" },
      { status: 400 },
    );
  }

  const items = Array.isArray(body) ? body : [body];
  if (items.length === 0) {
    return Response.json({ ok: false, error: "no drafts in body" }, { status: 400 });
  }
  if (items.length > 20) {
    return Response.json(
      { ok: false, error: "at most 20 drafts per request" },
      { status: 400 },
    );
  }

  const created: number[] = [];
  const rejected: { index: number; errors: string[] }[] = [];

  for (let index = 0; index < items.length; index++) {
    const validated = validateDraft(items[index]);
    if (!validated.ok || !validated.value) {
      rejected.push({ index, errors: validated.errors });
      continue;
    }
    try {
      const result = await insertDraft(validated.value, "api");
      if (result.draft) created.push(result.draft.id);
    } catch (error) {
      rejected.push({
        index,
        errors: [error instanceof Error ? error.message : String(error)],
      });
    }
  }

  // Nothing stored at all is a client error; a partial success is reported as
  // 207 so the caller can see exactly which items failed.
  const status =
    created.length === 0 ? 400 : rejected.length > 0 ? 207 : 201;

  return Response.json(
    { ok: created.length > 0, created, rejected },
    { status },
  );
}

export async function GET() {
  return Response.json(
    {
      ok: true,
      message:
        "POST drafts here with an Authorization: Bearer token. See DRAFTS.md.",
    },
    { status: 200 },
  );
}
