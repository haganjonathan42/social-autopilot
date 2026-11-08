/**
 * Creates or updates the database tables from a local shell:
 *
 *   npm run db:push
 *
 * Needs DATABASE_URL in .env.local (or in the environment).
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config();

async function main() {
  const { migrate } = await import("../src/lib/db");
  await migrate();
  console.log("Schema is up to date.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
