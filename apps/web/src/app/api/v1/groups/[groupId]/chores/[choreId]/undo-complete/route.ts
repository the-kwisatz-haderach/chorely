import { type ChoreResponse } from "@chorely/api-client";
import { getDeps } from "@/server/deps";
import { undoCompleteChore } from "@/server/groups/chores";
import { requireMember } from "@/server/groups/context";
import { handle, json } from "@/server/http";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ groupId: string; choreId: string }> };

export function POST(req: Request, { params }: Ctx): Promise<Response> {
  return handle(async () => {
    const { groupId, choreId } = await params;
    const ctx = await requireMember(getDeps(), req, groupId);
    const body: ChoreResponse = await undoCompleteChore(ctx, choreId);
    return ctx.withSession(json(body));
  });
}
