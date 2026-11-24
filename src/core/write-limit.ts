import { lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { mcpWriteLimit } from "@/db/schema";

/**
 * Per-user limit on MCP writes so a looping agent can't flood the database.
 * A counter per user per clock hour in Postgres, so every server instance
 * (each Worker isolate) sees the same count. Fixed windows: a burst across an
 * hour boundary can reach up to twice the limit.
 */
const WINDOW_MS = 60 * 60 * 1000;
const MAX_WRITES = 60;

/** Records a write and returns an error message if the user is over the limit. */
export async function checkWriteLimit(userId: string, now = Date.now()): Promise<string | null> {
  const windowStart = new Date(now - (now % WINDOW_MS));

  // One atomic statement: create the row or bump it, and read the new count.
  const [row] = await db
    .insert(mcpWriteLimit)
    .values({ userId, windowStart, count: 1 })
    .onConflictDoUpdate({
      target: [mcpWriteLimit.userId, mcpWriteLimit.windowStart],
      set: { count: sql`${mcpWriteLimit.count} + 1` },
    })
    .returning({ count: mcpWriteLimit.count });

  // Occasionally drop old windows; cheap, and no scheduled job needed.
  if (Math.random() < 0.02) {
    await db.delete(mcpWriteLimit).where(lt(mcpWriteLimit.windowStart, new Date(now - 2 * WINDOW_MS)));
  }

  if (row.count > MAX_WRITES) {
    return `Too many saves in the last hour (limit ${MAX_WRITES}). Try again later.`;
  }
  return null;
}
