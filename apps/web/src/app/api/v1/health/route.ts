import type { HealthResponse } from "@chorely/api-client";
import { pingDatabase } from "@/server/db/ping";
import { getDeps } from "@/server/deps";
import { errorResponse, json } from "@/server/http";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  let up = false;
  try {
    up = await pingDatabase(getDeps().db);
  } catch {
    // Dependencies failed to initialise (e.g. DATABASE_URL unset): treated as unavailable.
  }
  if (!up) return errorResponse("unavailable", "Database is unavailable");
  const body: HealthResponse = { status: "ok" };
  return json(body);
}
