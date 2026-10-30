import { sql } from "drizzle-orm";
import type { Database } from "./client";

/** Infrastructure readiness check. Touches no Group data, so it needs no Member context (ADR 0004). */
export async function pingDatabase(db: Database): Promise<boolean> {
  try {
    await db.execute(sql`select 1`);
    return true;
  } catch {
    return false;
  }
}
