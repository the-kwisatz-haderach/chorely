import { sql } from "drizzle-orm";
import type { Database } from "../db/client";
import { rateLimits } from "../db/schema";

/**
 * Counts one hit against `key` in a fixed window and returns the count within the current window.
 * One atomic upsert, so concurrent requests cannot undercount.
 */
export async function hit(db: Database, key: string, windowMs: number, now: Date): Promise<number> {
  const nowIso = now.toISOString();
  const expired = sql`${rateLimits.windowStart} <= ${nowIso}::timestamptz - ${windowMs} * interval '1 millisecond'`;
  const [row] = await db
    .insert(rateLimits)
    .values({ key, windowStart: now, count: 1 })
    .onConflictDoUpdate({
      target: rateLimits.key,
      set: {
        count: sql`case when ${expired} then 1 else ${rateLimits.count} + 1 end`,
        windowStart: sql`case when ${expired} then ${nowIso}::timestamptz else ${rateLimits.windowStart} end`,
      },
    })
    .returning({ count: rateLimits.count });
  return row?.count ?? 1;
}
