import { asc, eq, and, sql } from "drizzle-orm";
import type { GroupDto, MemberDto } from "@chorely/api-client";
import type { Database } from "../db/client";
import { accounts, groups, members } from "../db/schema";
import { AppError } from "../http";
import { newId } from "../ids";
import type { MemberContext } from "./context";

/**
 * All Group data access lives here (ADR 0004). Everything keyed by a `MemberContext` is scoped to its Group.
 * The Account-keyed functions first are the exception: they run before a Member context can exist.
 */

const groupColumns = { id: groups.id, name: groups.name };

export function groupNotFound(): AppError {
  return new AppError("not_found", "Group not found");
}

/** The Member row for an Account in a Group, if any. Used to build a `MemberContext`. */
export async function findMemberId(db: Database, groupId: string, accountId: string): Promise<string | undefined> {
  const [member] = await db
    .select({ id: members.id })
    .from(members)
    .where(and(eq(members.groupId, groupId), eq(members.accountId, accountId)));
  return member?.id;
}

/** The Groups an Account belongs to. */
export async function listGroupsFor(db: Database, accountId: string): Promise<GroupDto[]> {
  return db
    .select(groupColumns)
    .from(members)
    .innerJoin(groups, eq(groups.id, members.groupId))
    .where(eq(members.accountId, accountId))
    .orderBy(asc(members.createdAt));
}

/** Creates a Group and makes the Account its first Member. v1 allows one Group per Account. */
export async function createGroup(db: Database, accountId: string, name: string): Promise<GroupDto> {
  return db.transaction(async (tx) => {
    // Serialises concurrent creates by the same Account so the one-Group check cannot be raced.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${accountId}))`);
    const [existing] = await tx.select({ id: members.id }).from(members).where(eq(members.accountId, accountId)).limit(1);
    if (existing) throw new AppError("conflict", "You are already in a Group");
    const group = { id: newId(), name };
    await tx.insert(groups).values(group);
    await tx.insert(members).values({ id: newId(), groupId: group.id, accountId });
    return group;
  });
}

export async function getGroup(ctx: MemberContext): Promise<GroupDto> {
  const [group] = await ctx.db.select(groupColumns).from(groups).where(eq(groups.id, ctx.groupId));
  if (!group) throw groupNotFound();
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
  const [group] = await ctx.db.update(groups).set({ name }).where(eq(groups.id, ctx.groupId)).returning(groupColumns);
  if (!group) throw groupNotFound();
  return group;
}
