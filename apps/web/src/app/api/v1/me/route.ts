import { setDisplayNameBodySchema, type MeResponse } from "@chorely/api-client";
import { setDisplayName } from "@/server/auth/accounts";
import { requireAccount } from "@/server/auth/request";
import { getDeps } from "@/server/deps";
import { handle, json, parseBody } from "@/server/http";

export const dynamic = "force-dynamic";

export function GET(req: Request): Promise<Response> {
  return handle(async () => {
    const { account, withSession } = await requireAccount(getDeps(), req);
    const body: MeResponse = { account };
    return withSession(json(body));
  });
}

export function PATCH(req: Request): Promise<Response> {
  return handle(async () => {
    const deps = getDeps();
    const { account, withSession } = await requireAccount(deps, req);
    const { displayName } = await parseBody(req, setDisplayNameBodySchema);
    const body: MeResponse = { account: await setDisplayName(deps.db, account.id, displayName) };
    return withSession(json(body));
  });
}
