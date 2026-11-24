/**
 * Simple per-user limit on MCP writes so a looping agent can't flood the
 * database. In-memory, so it is per server instance; move it to the database
 * or Redis once we run more than one instance.
 */
const WINDOW_MS = 60 * 60 * 1000;
const MAX_WRITES = 60;

const hits = new Map<string, number[]>();

/** Records a write and returns an error message if the user is over the limit. */
export function checkWriteLimit(userId: string, now = Date.now()): string | null {
  const recent = (hits.get(userId) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_WRITES) {
    hits.set(userId, recent);
    return `Too many saves in the last hour (limit ${MAX_WRITES}). Try again later.`;
  }
  recent.push(now);
  hits.set(userId, recent);
  return null;
}
