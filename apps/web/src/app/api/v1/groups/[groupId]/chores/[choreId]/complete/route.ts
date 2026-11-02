import { type CompleteChoreResponse } from "@chorely/api-client";
import { getDeps } from "@/server/deps";
import { completeChore } from "@/server/groups/chores";
import { requireMember } from "@/server/groups/context";
import { handle, json } from "@/server/http";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ groupId: string; choreId: string }> };

export function POST(req: Request, { params }: Ctx): Promise<Response> {
  return handle(async () => {
    const { groupId, choreId } = await params;
    const ctx = await requireMember(getDeps(), req, groupId);
    const body: CompleteChoreResponse = await completeChore(ctx, choreId);
    return ctx.withSession(json(body));
  });
}
