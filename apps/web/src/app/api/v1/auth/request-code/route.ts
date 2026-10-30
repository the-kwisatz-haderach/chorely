import { requestCodeBodySchema, type OkResponse } from "@chorely/api-client";
import { requestCode } from "@/server/auth/auth";
import { clientIp } from "@/server/auth/request";
import { getDeps } from "@/server/deps";
import { handle, json, parseBody } from "@/server/http";

export const dynamic = "force-dynamic";

export function POST(req: Request): Promise<Response> {
  return handle(async () => {
    const { email } = await parseBody(req, requestCodeBodySchema);
    await requestCode(getDeps(), email, clientIp(req));
    const body: OkResponse = { status: "ok" };
    return json(body);
  });
}
