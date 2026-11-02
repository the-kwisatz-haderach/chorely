import { leaveGroupBodySchema, type LeaveGroupResponse } from "@chorely/api-client";
import { getDeps } from "@/server/deps";
import { requireMember } from "@/server/groups/context";
import { leaveGroup } from "@/server/groups/data";
import { handle, json, parseBody } from "@/server/http";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ groupId: string }> };

export function POST(req: Request, { params }: Ctx): Promise<Response> {
  return handle(async () => {
    const ctx = await requireMember(getDeps(), req, (await params).groupId);
    const { deleteGroup } = await parseBody(req, leaveGroupBodySchema);
    const body: LeaveGroupResponse = await leaveGroup(ctx, deleteGroup);
    return ctx.withSession(json(body));
  });
}
