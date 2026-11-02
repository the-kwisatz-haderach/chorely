import { asc, eq, and, sql } from "drizzle-orm";
import { inviteTokenSchema, type GroupDto, type MemberDto } from "@chorely/api-client";
import { hashToken } from "../auth/hash";
import type { Database } from "../db/client";
import { accounts, groups, inviteLinks, members } from "../db/schema";
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

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** Serialises work per Account so the one-Group-per-Account check cannot be raced. */
async function lockAccount(tx: Tx, accountId: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${accountId}))`);
}

async function accountGroupId(tx: Tx, accountId: string): Promise<string | undefined> {
  const [row] = await tx.select({ groupId: members.groupId }).from(members).where(eq(members.accountId, accountId)).limit(1);
  return row?.groupId;
}

/** Creates a Group and makes the Account its first Member. v1 allows one Group per Account. */
export async function createGroup(db: Database, accountId: string, name: string): Promise<GroupDto> {
  return db.transaction(async (tx) => {
    await lockAccount(tx, accountId);
    if (await accountGroupId(tx, accountId)) throw new AppError("conflict", "You are already in a Group");
    const group = { id: newId(), name };
    await tx.insert(groups).values(group);
    await tx.insert(members).values({ id: newId(), groupId: group.id, accountId });
    return group;
  });
}

function invalidInvite(): AppError {
  return new AppError("invalid_invite", "This Invite link is not valid any more. Ask for a new one.");
}

/** Makes the Account a Member of the Group the token belongs to. v1 allows one Group per Account. */
export async function joinWithToken(db: Database, accountId: string, token: string): Promise<GroupDto> {
  if (!inviteTokenSchema.safeParse(token).success) throw invalidInvite();
  return db.transaction(async (tx) => {
    await lockAccount(tx, accountId);
    const [group] = await tx
      .select(groupColumns)
      .from(inviteLinks)
      .innerJoin(groups, eq(groups.id, inviteLinks.groupId))
      .where(eq(inviteLinks.tokenHash, hashToken(token)));
    if (!group) throw invalidInvite();

    const current = await accountGroupId(tx, accountId);
    if (current === group.id) return group;
    if (current) throw new AppError("conflict", "You are already in a Group, so you can't join another yet");
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
