import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

/**
 * Postgres via DATABASE_URL: a hosted database (e.g. Neon) in production, and
 * locally the embedded Postgres that `npm run dev` starts in ./.data.
 */
function createDb() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set. Start the app with `npm run dev`, or set it in .env.local.");
  }
  const max = Number(process.env.DATABASE_POOL_MAX ?? 10);
  return drizzle(postgres(url, { max }), { schema });
}

type Db = ReturnType<typeof createDb>;

// Reuse one connection pool across hot reloads in dev.
const globalForDb = globalThis as unknown as { __klassdeckDb?: Db };
export const db: Db = globalForDb.__klassdeckDb ?? createDb();
if (process.env.NODE_ENV !== "production") globalForDb.__klassdeckDb = db;
