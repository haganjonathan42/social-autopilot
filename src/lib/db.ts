import { neon } from "@neondatabase/serverless";
import { required } from "./env";
import { SCHEMA_STATEMENTS } from "./schema";

/**
 * Neon's HTTP driver: one round trip per query and no connection pool to keep
 * alive, which is what a serverless function on Vercel needs.
 *
 * DATABASE_URL comes from the Neon / Vercel Postgres integration.
 */
let client: ReturnType<typeof neon> | null = null;

export function sql() {
  if (!client) {
    client = neon(required("DATABASE_URL"));
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
