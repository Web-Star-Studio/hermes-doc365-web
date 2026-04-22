/**
 * Postgres client used by the app. One Pool shared across route handlers.
 */

import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

declare global {
  // eslint-disable-next-line no-var
  var __pgPool: pg.Pool | undefined;
}

function getPool(): pg.Pool {
  if (!global.__pgPool) {
    global.__pgPool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      max: 10,
      idleTimeoutMillis: 30_000,
    });
  }
  return global.__pgPool;
}

export const pool = getPool();
export const db = drizzle(pool, { schema });
export { schema };
