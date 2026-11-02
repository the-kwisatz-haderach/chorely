import { randomBytes } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { inviteTokenSchema, type GroupDto } from "@chorely/api-client";
import { hashToken } from "../auth/hash";
import type { Database } from "../db/client";
import { groups, inviteLinks, members } from "../db/schema";
import { AppError } from "../http";
import { newId } from "../ids";
import type { MemberContext } from "./context";

/** Creates the Group's Invite link or replaces it, which stops the old one. Returns the only copy of the token. */
export async function replaceInviteLink(ctx: MemberContext): Promise<string> {
  const token = randomBytes(16).toString("base64url");
  const tokenHash = hashToken(token);
  await ctx.db
    .insert(inviteLinks)
    .values({ groupId: ctx.groupId, tokenHash })
    .onConflictDoUpdate({ target: inviteLinks.groupId, set: { tokenHash, createdAt: sql`now()` } });
  return token;
}

function invalidInvite(): AppError {
  return new AppError("invalid_invite", "This Invite link is not valid any more. Ask for a new one.");
}

/** Makes the Account a Member of the Group the token belongs to. v1 allows one Group per Account. */
export async function joinWithToken(db: Database, accountId: string, token: string): Promise<GroupDto> {
  if (!inviteTokenSchema.safeParse(token).success) throw invalidInvite();
  return db.transaction(async (tx) => {
    // Same lock as createGroup, so create/join races by one Account cannot both pass the one-Group check.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${accountId}))`);
    const [group] = await tx
      .select({ id: groups.id, name: groups.name })
      .from(inviteLinks)
      .innerJoin(groups, eq(groups.id, inviteLinks.groupId))
      .where(eq(inviteLinks.tokenHash, hashToken(token)));
    if (!group) throw invalidInvite();

    const [existing] = await tx
      .select({ groupId: members.groupId })
      .from(members)
      .where(eq(members.accountId, accountId))
      .limit(1);
    if (existing?.groupId === group.id) return group;
    if (existing) throw new AppError("conflict", "You are already in a Group, so you can't join another yet");
    await tx.insert(members).values({ id: newId(), groupId: group.id, accountId });
    return group;
  });
}
