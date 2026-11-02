import { joinGroupBodySchema, type GroupResponse } from "@chorely/api-client";
import { requireAccount } from "@/server/auth/request";
import { getDeps } from "@/server/deps";
import { joinWithToken } from "@/server/groups/invites";
import { handle, json, parseBody } from "@/server/http";

export const dynamic = "force-dynamic";

export function POST(req: Request): Promise<Response> {
  return handle(async () => {
    const deps = getDeps();
    const { account, withSession } = await requireAccount(deps, req);
    const { token } = await parseBody(req, joinGroupBodySchema);
    const body: GroupResponse = { group: await joinWithToken(deps.db, account.id, token) };
    return withSession(json(body));
  });
}
