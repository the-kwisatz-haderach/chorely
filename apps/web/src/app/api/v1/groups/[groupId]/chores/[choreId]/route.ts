import { updateChoreBodySchema, type ChoreResponse, type DeleteChoreResponse } from "@chorely/api-client";
import { getDeps } from "@/server/deps";
import { deleteChore, updateChore } from "@/server/groups/chores";
import { requireMember } from "@/server/groups/context";
import { handle, json, parseBody } from "@/server/http";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ groupId: string; choreId: string }> };

export function PATCH(req: Request, { params }: Ctx): Promise<Response> {
  return handle(async () => {
    const { groupId, choreId } = await params;
    const ctx = await requireMember(getDeps(), req, groupId);
    const input = await parseBody(req, updateChoreBodySchema);
    const body: ChoreResponse = await updateChore(ctx, choreId, input);
    return ctx.withSession(json(body));
  });
}

export function DELETE(req: Request, { params }: Ctx): Promise<Response> {
  return handle(async () => {
    const { groupId, choreId } = await params;
    const ctx = await requireMember(getDeps(), req, groupId);
    const body: DeleteChoreResponse = await deleteChore(ctx, choreId);
    return ctx.withSession(json(body));
  });
}
