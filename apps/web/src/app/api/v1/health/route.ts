import { sql } from "drizzle-orm";
import type { HealthResponse } from "@chorely/api-client";
import { getDeps } from "@/server/deps";
import { errorResponse, json } from "@/server/http";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    const { db } = getDeps();
    await db.execute(sql`select 1`);
  } catch {
    return errorResponse("unavailable", "Database is unavailable");
  }
  const body: HealthResponse = { status: "ok" };
  return json(body);
}
