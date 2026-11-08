/**
 * Database schema, as a list of statements.
 *
 * Kept in TypeScript rather than a .sql file on purpose: a serverless function
 * on Vercel cannot rely on arbitrary files being present in its bundle, and the
 * migration runs from inside a route handler.
 *
 * Every statement must be idempotent — `migrate()` runs on demand and on deploy.
 */
export const SCHEMA_STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS drafts (
     id            BIGSERIAL PRIMARY KEY,
     topic         TEXT NOT NULL,
     facebook      TEXT,
     instagram     TEXT,
     linkedin      TEXT,
     x             TEXT,
     image_idea    TEXT,
     image_url     TEXT,
     link_url      TEXT,
     scheduled_for TIMESTAMPTZ,
     status        TEXT NOT NULL DEFAULT 'pending',
     source        TEXT NOT NULL DEFAULT 'api',
     source_ref    TEXT,
     created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
     updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,

  // Columns added after the first release. Harmless on a fresh database.
  `ALTER TABLE drafts ADD COLUMN IF NOT EXISTS image_url TEXT`,
  `ALTER TABLE drafts ADD COLUMN IF NOT EXISTS link_url TEXT`,

  // A GitHub file is imported exactly once: the path is its identity.
  // A plain unique index, not a partial one: Postgres treats NULLs as distinct,
  // so API drafts (source_ref NULL) are unaffected, and `ON CONFLICT
  // (source_ref)` can infer this index. A partial index would need its
  // predicate repeated in every ON CONFLICT clause.
  `CREATE UNIQUE INDEX IF NOT EXISTS drafts_source_ref_key
     ON drafts (source_ref)`,
  `CREATE INDEX IF NOT EXISTS drafts_status_idx ON drafts (status)`,
  `CREATE INDEX IF NOT EXISTS drafts_scheduled_idx ON drafts (scheduled_for)`,

  `CREATE TABLE IF NOT EXISTS publish_logs (
     id            BIGSERIAL PRIMARY KEY,
     draft_id      BIGINT NOT NULL REFERENCES drafts (id) ON DELETE CASCADE,
     platform      TEXT NOT NULL,
     status        TEXT NOT NULL,
     external_id   TEXT,
     external_url  TEXT,
     message       TEXT,
     created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS publish_logs_draft_idx
     ON publish_logs (draft_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS publish_logs_created_idx
     ON publish_logs (created_at DESC)`,
];
