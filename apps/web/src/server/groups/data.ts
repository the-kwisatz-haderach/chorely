import { asc, eq } from "drizzle-orm";
import type { GroupDto, MemberDto } from "@chorely/api-client";
import { accounts, groups, members } from "../db/schema";
import { AppError } from "../http";
import type { MemberContext } from "./context";

/** All Group data access goes through here and takes a `MemberContext`, which scopes every query to its Group. */

export async function getGroup(ctx: MemberContext): Promise<GroupDto> {
  const [group] = await ctx.db.select({ id: groups.id, name: groups.name }).from(groups).where(eq(groups.id, ctx.groupId));
  if (!group) throw new AppError("not_found", "Group not found");
  return group;
}

export async function listMembers(ctx: MemberContext): Promise<MemberDto[]> {
  return ctx.db
    .select({ id: members.id, accountId: members.accountId, displayName: accounts.displayName })
    .from(members)
    .innerJoin(accounts, eq(accounts.id, members.accountId))
    .where(eq(members.groupId, ctx.groupId))
    .orderBy(asc(members.createdAt), asc(members.id));
}

export async function renameGroup(ctx: MemberContext, name: string): Promise<GroupDto> {
  const [group] = await ctx.db
    .update(groups)
    .set({ name })
    .where(eq(groups.id, ctx.groupId))
    .returning({ id: groups.id, name: groups.name });
  if (!group) throw new AppError("not_found", "Group not found");
  return group;
}
