import { renameGroupBodySchema, type GroupDetailResponse, type GroupResponse } from "@chorely/api-client";
import { getDeps } from "@/server/deps";
import { requireMember } from "@/server/groups/context";
import { getGroup, listMembers, renameGroup } from "@/server/groups/data";
import { handle, json, parseBody } from "@/server/http";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ groupId: string }> };

export function GET(req: Request, { params }: Ctx): Promise<Response> {
  return handle(async () => {
    const ctx = await requireMember(getDeps(), req, (await params).groupId);
    const body: GroupDetailResponse = { group: await getGroup(ctx), members: await listMembers(ctx) };
    return ctx.withSession(json(body));
  });
}

export function PATCH(req: Request, { params }: Ctx): Promise<Response> {
  return handle(async () => {
    const ctx = await requireMember(getDeps(), req, (await params).groupId);
    const { name } = await parseBody(req, renameGroupBodySchema);
    const body: GroupResponse = { group: await renameGroup(ctx, name) };
    return ctx.withSession(json(body));
  });
}
