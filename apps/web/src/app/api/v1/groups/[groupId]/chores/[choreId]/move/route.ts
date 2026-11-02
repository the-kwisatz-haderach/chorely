import { moveChoreBodySchema, type ChoreResponse } from "@chorely/api-client";
import { getDeps } from "@/server/deps";
import { moveChore } from "@/server/groups/chores";
import { requireMember } from "@/server/groups/context";
import { handle, json, parseBody } from "@/server/http";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ groupId: string; choreId: string }> };

export function POST(req: Request, { params }: Ctx): Promise<Response> {
  return handle(async () => {
    const { groupId, choreId } = await params;
    const ctx = await requireMember(getDeps(), req, groupId);
    const input = await parseBody(req, moveChoreBodySchema);
    const body: ChoreResponse = await moveChore(ctx, choreId, input);
    return ctx.withSession(json(body));
  });
}
