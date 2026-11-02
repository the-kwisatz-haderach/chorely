import { addChoreBodySchema, type AddChoreResponse, type QueueResponse } from "@chorely/api-client";
import { getDeps } from "@/server/deps";
import { addChore, getQueue } from "@/server/groups/chores";
import { requireMember } from "@/server/groups/context";
import { handle, json, parseBody } from "@/server/http";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ groupId: string }> };

export function GET(req: Request, { params }: Ctx): Promise<Response> {
  return handle(async () => {
    const ctx = await requireMember(getDeps(), req, (await params).groupId);
    const body: QueueResponse = await getQueue(ctx);
    return ctx.withSession(json(body));
  });
}

export function POST(req: Request, { params }: Ctx): Promise<Response> {
  return handle(async () => {
    const ctx = await requireMember(getDeps(), req, (await params).groupId);
    const input = await parseBody(req, addChoreBodySchema);
    const body: AddChoreResponse = await addChore(ctx, input);
    return ctx.withSession(json(body, 201));
  });
}
