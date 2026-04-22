/**
 * Apply pending Drizzle migrations against DATABASE_URL.
 *
 * Runs from `pnpm db:migrate` and from `scripts/bootstrap.sh` on first boot.
 * No-op when the `__drizzle_migrations` table already has all recorded migrations.
 */

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import path from "node:path";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }

  const pool = new pg.Pool({ connectionString: url });
  const db = drizzle(pool);

  const migrationsFolder = path.join(process.cwd(), "src/db/migrations");
  console.log(`Applying migrations from ${migrationsFolder}`);
  await migrate(db, { migrationsFolder });
  console.log("Migrations applied.");
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
