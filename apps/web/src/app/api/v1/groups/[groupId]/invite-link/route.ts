import type { InviteLinkResponse } from "@chorely/api-client";
import { getDeps } from "@/server/deps";
import { requireMember } from "@/server/groups/context";
import { replaceInviteLink } from "@/server/groups/invites";
import { handle, json } from "@/server/http";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ groupId: string }> };

export function POST(req: Request, { params }: Ctx): Promise<Response> {
  return handle(async () => {
    const ctx = await requireMember(getDeps(), req, (await params).groupId);
    const body: InviteLinkResponse = { token: await replaceInviteLink(ctx) };
    return ctx.withSession(json(body, 201));
  });
}
