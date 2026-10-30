import { setDisplayNameBodySchema, type MeResponse } from "@chorely/api-client";
import { setDisplayName } from "@/server/auth/auth";
import { requireAccount } from "@/server/auth/request";
import { getDeps } from "@/server/deps";
import { handle, json, parseBody } from "@/server/http";

export const dynamic = "force-dynamic";

export function GET(req: Request): Promise<Response> {
  return handle(async () => {
    const account = await requireAccount(getDeps(), req);
    const body: MeResponse = { account };
    return json(body);
  });
}

export function PATCH(req: Request): Promise<Response> {
  return handle(async () => {
    const deps = getDeps();
    const account = await requireAccount(deps, req);
    const { displayName } = await parseBody(req, setDisplayNameBodySchema);
    const body: MeResponse = { account: await setDisplayName(deps, account.id, displayName) };
    return json(body);
  });
}
