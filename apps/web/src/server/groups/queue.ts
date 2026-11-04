import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { chores } from "../db/schema";
import type { MemberContext } from "./context";

/** A transaction on the Group database, as the Chore mutations run them. */
export type Tx = Parameters<Parameters<MemberContext["db"]["transaction"]>[0]>[0];

/** Queue order: `(position, id)`, with keys compared byte-wise. */
export const queueOrder = [asc(sql`${chores.position} collate "C"`), asc(chores.id)];
export const reverseQueueOrder = [desc(sql`${chores.position} collate "C"`), desc(chores.id)];

/** The open Chores' keys and Due dates in Queue order, for seeding a new Chore's Position. */
export function openQueue(tx: Tx, ctx: MemberContext) {
  return tx
    .select({ position: chores.position, dueDate: chores.dueDate })
    .from(chores)
    .where(and(eq(chores.groupId, ctx.groupId), isNull(chores.completedAt)))
    .orderBy(...queueOrder);
}
