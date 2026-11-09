import { neon } from "@neondatabase/serverless";
import { SCHEMA_STATEMENTS } from "./schema";

/**
 * Neon's HTTP driver: one round trip per query and no connection pool to keep
 * alive, which is what a serverless function on Vercel needs.
 *
 * DATABASE_URL comes from the Neon / Vercel Postgres integration.
 */
let client: ReturnType<typeof neon> | null = null;

/**
 * Vercel's Postgres/Neon integrations do not agree on a variable name: some set
 * DATABASE_URL, others POSTGRES_URL. Accept either rather than failing a first
 * deploy over the spelling.
 */
function connectionString(): string {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) {
    throw new Error(
      "No database connection string: set DATABASE_URL (or POSTGRES_URL).",
    );
  }
  return url;
}

export function sql() {
  if (!client) {
    client = neon(connectionString());
  }
  return client;
}

/** Runs a parameterised query and returns typed rows. */
export async function query<T>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const rows = await sql().query(text, params as never[]);
  return rows as T[];
}

/** Applies the schema. Idempotent, so it is safe to call at any time. */
export async function migrate(): Promise<void> {
  for (const statement of SCHEMA_STATEMENTS) {
    await sql().query(statement);
  }
}
