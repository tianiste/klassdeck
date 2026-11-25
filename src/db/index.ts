import { getCloudflareContext } from "@opennextjs/cloudflare";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

/**
 * Postgres access for every runtime:
 * - `npm run dev` / `next start` (Node): one pool from DATABASE_URL, which `npm run dev`
 *   points at the embedded Postgres in ./.data.
 * - Cloudflare Workers: a client per request, through the HYPERDRIVE binding (Neon) when it is
 *   configured, otherwise DATABASE_URL. Workers can't reuse a socket across requests, so
 *   pooling is Hyperdrive's job there; the runtime closes a request's sockets when it ends.
 */

type Db = ReturnType<typeof drizzle<typeof schema>>;

type Hyperdrive = { connectionString: string };
type WorkerEnv = { HYPERDRIVE?: Hyperdrive; DATABASE_URL?: string };
type WorkerContext = { env: WorkerEnv };

function databaseUrl(env?: WorkerEnv): string {
  const url = env?.DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set. Start the app with `npm run dev`, or set it in .env.local.");
  }
  return url;
}

/**
 * A shared pooler in transaction mode on port 6543 (Supabase's convention) can't keep
 * prepared statements between transactions, so postgres.js must not use them there.
 * Production uses Neon's direct connection through Hyperdrive, which supports them, so
 * this only matters for a direct DATABASE_URL to such a pooler.
 */
function usesTransactionPooler(url: string): boolean {
  try {
    return new URL(url).port === "6543";
  } catch {
    return false;
  }
}

function connect(url: string, max: number) {
  return postgres(url, { max, prepare: !usesTransactionPooler(url) });
}

/** The Cloudflare request context, or undefined outside a Worker (e.g. `next dev`). */
function workerContext(): WorkerContext | undefined {
  try {
    return getCloudflareContext() as unknown as WorkerContext;
  } catch {
    return undefined;
  }
}

// One client per Worker request, keyed by that request's context object.
const perRequest = new WeakMap<object, Db>();

function workerDb(cf: WorkerContext): Db {
  let db = perRequest.get(cf);
  if (db) return db;
  const viaHyperdrive = cf.env.HYPERDRIVE?.connectionString;
  const client = viaHyperdrive
    ? // Hyperdrive pools upstream; fetch_types off saves a round trip per request.
      postgres(viaHyperdrive, { max: 5, fetch_types: false })
    : connect(databaseUrl(cf.env), 5);
  db = drizzle(client, { schema });
  perRequest.set(cf, db);
  // No explicit end(): the runtime closes a request's sockets when the request finishes,
  // and ending early would cut off queries that run after the response starts streaming.
  return db;
}

// Reuse one connection pool across hot reloads in dev.
const globalForDb = globalThis as unknown as { __klassdeckDb?: Db };

function nodeDb(): Db {
  if (!globalForDb.__klassdeckDb) {
    const max = Number(process.env.DATABASE_POOL_MAX ?? 10);
    globalForDb.__klassdeckDb = drizzle(connect(databaseUrl(), max), { schema });
  }
  return globalForDb.__klassdeckDb;
}

/** The database for the current request (Workers) or process (Node). */
export function getDb(): Db {
  const cf = workerContext();
  return cf ? workerDb(cf) : nodeDb();
}

/**
 * `db` resolves to the right client on every property access, so modules can keep
 * importing it at the top level (Better Auth's adapter included).
 */
export const db: Db = new Proxy({} as Db, {
  get(_target, prop) {
    const real = getDb();
    const value = Reflect.get(real, prop, real);
    return typeof value === "function" ? value.bind(real) : value;
  },
});
