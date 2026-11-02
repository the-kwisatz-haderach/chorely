import { asc, eq, sql } from "drizzle-orm";
import type { GroupDto } from "@chorely/api-client";
import type { Database } from "../db/client";
import { groups, members } from "../db/schema";
import { AppError } from "../http";
import { newId } from "../ids";

/** The Groups an Account belongs to. Runs before any Member context exists, so it is keyed by Account. */
export async function listGroupsFor(db: Database, accountId: string): Promise<GroupDto[]> {
  return db
    .select({ id: groups.id, name: groups.name })
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
