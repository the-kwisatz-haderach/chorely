import { assignChoreBodySchema, type ChoreResponse } from "@chorely/api-client";
import { getDeps } from "@/server/deps";
import { assignChore } from "@/server/groups/chores";
import { requireMember } from "@/server/groups/context";
import { handle, json, parseBody } from "@/server/http";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ groupId: string; choreId: string }> };

export function PUT(req: Request, { params }: Ctx): Promise<Response> {
  return handle(async () => {
    const { groupId, choreId } = await params;
    const ctx = await requireMember(getDeps(), req, groupId);
    const { assigneeId } = await parseBody(req, assignChoreBodySchema);
    const body: ChoreResponse = await assignChore(ctx, choreId, assigneeId);
    return ctx.withSession(json(body));
  });
}
