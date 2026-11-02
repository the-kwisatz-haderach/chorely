import { groupNameBodySchema, type GroupResponse, type ListGroupsResponse } from "@chorely/api-client";
import { requireAccount } from "@/server/auth/request";
import { getDeps } from "@/server/deps";
import { createGroup, listGroupsFor } from "@/server/groups/data";
import { handle, json, parseBody } from "@/server/http";

export const dynamic = "force-dynamic";

export function GET(req: Request): Promise<Response> {
  return handle(async () => {
    const deps = getDeps();
    const { account, withSession } = await requireAccount(deps, req);
    const body: ListGroupsResponse = { groups: await listGroupsFor(deps.db, account.id) };
    return withSession(json(body));
  });
}

export function POST(req: Request): Promise<Response> {
  return handle(async () => {
    const deps = getDeps();
    const { account, withSession } = await requireAccount(deps, req);
    const { name } = await parseBody(req, groupNameBodySchema);
    const body: GroupResponse = { group: await createGroup(deps.db, account.id, name) };
    return withSession(json(body, 201));
  });
}
