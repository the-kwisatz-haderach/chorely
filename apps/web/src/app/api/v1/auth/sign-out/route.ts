import type { OkResponse } from "@chorely/api-client";
import { signOut } from "@/server/auth/auth";
import { clearedSessionCookie, tokenFrom } from "@/server/auth/request";
import { getDeps } from "@/server/deps";
import { handle, json } from "@/server/http";

export const dynamic = "force-dynamic";

export function POST(req: Request): Promise<Response> {
  return handle(async () => {
    await signOut(getDeps(), tokenFrom(req));
    const body: OkResponse = { status: "ok" };
    return json(body, 200, { "set-cookie": clearedSessionCookie() });
  });
}
