import { query } from "./db";
import type {
  Draft,
  DraftInput,
  DraftSource,
  DraftStatus,
  PublishLog,
} from "./types";

const DRAFT_COLUMNS = `id, topic, facebook, instagram, linkedin, x,
  image_idea, image_url, link_url, scheduled_for, status, source, source_ref,
  created_at, updated_at`;

export interface InsertResult {
  draft: Draft | null;
  /** True when a GitHub file with this path had already been imported. */
  duplicate: boolean;
}

/**
 * Inserts a draft.
 *
 * When `sourceRef` is set (GitHub imports use the file path) a second insert of
 * the same path is a no-op, so the importer can run every 15 minutes without
 * creating duplicates.
 */
export async function insertDraft(
  input: DraftInput,
  source: DraftSource,
  sourceRef?: string,
): Promise<InsertResult> {
  const rows = await query<Draft>(
    `INSERT INTO drafts
       (topic, facebook, instagram, linkedin, x, image_idea, image_url,
        link_url, scheduled_for, source, source_ref)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     ON CONFLICT (source_ref) DO NOTHING
     RETURNING ${DRAFT_COLUMNS}`,
    [
      input.topic,
      input.facebook ?? null,
      input.instagram ?? null,
      input.linkedin ?? null,
      input.x ?? null,
      input.imageIdea ?? null,
      input.imageUrl ?? null,
      input.linkUrl ?? null,
      input.scheduledFor ?? null,
      source,
      sourceRef ?? null,
    ],
  );
  if (rows.length === 0) return { draft: null, duplicate: true };
  return { draft: rows[0], duplicate: false };
}

export async function listDrafts(limit = 200): Promise<Draft[]> {
  return query<Draft>(
    `SELECT ${DRAFT_COLUMNS} FROM drafts
     ORDER BY
       CASE status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END,
       COALESCE(scheduled_for, created_at) DESC
     LIMIT $1`,
    [limit],
  );
}

export async function getDraft(id: number): Promise<Draft | null> {
  const rows = await query<Draft>(
    `SELECT ${DRAFT_COLUMNS} FROM drafts WHERE id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

export async function updateDraftText(
  id: number,
  fields: Pick<
    DraftInput,
    "topic" | "facebook" | "instagram" | "linkedin" | "x" | "imageUrl" | "linkUrl"
  >,
): Promise<void> {
  await query(
    `UPDATE drafts SET
       topic = $2, facebook = $3, instagram = $4, linkedin = $5, x = $6,
       image_url = $7, link_url = $8, updated_at = now()
     WHERE id = $1`,
    [
      id,
      fields.topic,
      fields.facebook ?? null,
      fields.instagram ?? null,
      fields.linkedin ?? null,
      fields.x ?? null,
      fields.imageUrl ?? null,
      fields.linkUrl ?? null,
    ],
  );
}

export async function setStatus(
  id: number,
  status: DraftStatus,
  scheduledFor?: string | null,
): Promise<void> {
  if (scheduledFor === undefined) {
    await query(`UPDATE drafts SET status = $2, updated_at = now() WHERE id = $1`, [
      id,
      status,
    ]);
    return;
  }
  await query(
    `UPDATE drafts SET status = $2, scheduled_for = $3, updated_at = now()
     WHERE id = $1`,
    [id, status, scheduledFor],
  );
}

/**
 * Claims a draft for publishing.
 *
 * The UPDATE only succeeds when the row is still in a publishable state, so two
 * overlapping cron runs cannot publish the same draft twice. Returns the claimed
 * draft, or null when another run got there first.
 */
export async function claimForPublishing(id: number): Promise<Draft | null> {
  const rows = await query<Draft>(
    `UPDATE drafts SET status = 'publishing', updated_at = now()
     WHERE id = $1 AND status IN ('approved', 'pending', 'failed', 'partial')
     RETURNING ${DRAFT_COLUMNS}`,
    [id],
  );
  return rows[0] ?? null;
}

/** Approved drafts whose scheduled time has arrived. */
export async function dueDrafts(limit = 25): Promise<Draft[]> {
  return query<Draft>(
    `SELECT ${DRAFT_COLUMNS} FROM drafts
     WHERE status = 'approved'
       AND scheduled_for IS NOT NULL
       AND scheduled_for <= now()
     ORDER BY scheduled_for ASC
     LIMIT $1`,
    [limit],
  );
}

export async function addLog(
  draftId: number,
  platform: string,
  status: "ok" | "error" | "skipped",
  details: {
    externalId?: string | null;
    externalUrl?: string | null;
    message?: string | null;
  } = {},
): Promise<void> {
  await query(
    `INSERT INTO publish_logs
       (draft_id, platform, status, external_id, external_url, message)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      draftId,
      platform,
      status,
      details.externalId ?? null,
      details.externalUrl ?? null,
      details.message ?? null,
    ],
  );
}

export async function logsForDrafts(
  draftIds: number[],
): Promise<Map<number, PublishLog[]>> {
  const byDraft = new Map<number, PublishLog[]>();
  if (draftIds.length === 0) return byDraft;
  const rows = await query<PublishLog>(
    `SELECT id, draft_id, platform, status, external_id, external_url, message,
            created_at
     FROM publish_logs
     WHERE draft_id = ANY($1::bigint[])
     ORDER BY created_at DESC`,
    [draftIds],
  );
  for (const row of rows) {
    const list = byDraft.get(row.draft_id);
    if (list) list.push(row);
    else byDraft.set(row.draft_id, [row]);
  }
  return byDraft;
}

export async function recentLogs(limit = 50): Promise<PublishLog[]> {
  return query<PublishLog>(
    `SELECT id, draft_id, platform, status, external_id, external_url, message,
            created_at
     FROM publish_logs ORDER BY created_at DESC LIMIT $1`,
    [limit],
  );
}
