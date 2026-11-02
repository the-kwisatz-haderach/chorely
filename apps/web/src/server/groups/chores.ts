import { and, asc, eq, sql } from "drizzle-orm";
import { seedPosition } from "@chorely/domain";
import type { AddChoreInput, AddChoreResponse, QueueResponse } from "@chorely/api-client";
import { chores, groups, members } from "../db/schema";
import { AppError } from "../http";
import { newId } from "../ids";
import type { MemberContext } from "./context";
import { groupNotFound } from "./data";

/** Chore data access. Every Chore mutation bumps the Group revision in the same transaction. */

const choreColumns = {
  id: chores.id,
  title: chores.title,
  note: chores.note,
  dueDate: chores.dueDate,
  assigneeId: chores.assigneeId,
  position: chores.position,
};

/** The open Chores of the Group in Queue order: `(position, id)`, byte-wise. */
export async function getQueue(ctx: MemberContext): Promise<QueueResponse> {
  return ctx.db.transaction(async (tx) => {
    const [group] = await tx.select({ revision: groups.revision }).from(groups).where(eq(groups.id, ctx.groupId));
    if (!group) throw groupNotFound();
    const rows = await tx
      .select(choreColumns)
      .from(chores)
      .where(eq(chores.groupId, ctx.groupId))
      .orderBy(asc(sql`${chores.position} collate "C"`), asc(chores.id));
    return { chores: rows, revision: group.revision };
  });
}

export async function addChore(ctx: MemberContext, input: AddChoreInput): Promise<AddChoreResponse> {
  return ctx.db.transaction(async (tx) => {
    // Bumping first takes the Group row lock, which serialises adds so each reads the Queue it inserts into.
    const [group] = await tx
      .update(groups)
      .set({ revision: sql`${groups.revision} + 1` })
      .where(eq(groups.id, ctx.groupId))
      .returning({ revision: groups.revision });
    if (!group) throw groupNotFound();

    if (input.assigneeId) {
      const [assignee] = await tx
        .select({ id: members.id })
        .from(members)
        .where(and(eq(members.id, input.assigneeId), eq(members.groupId, ctx.groupId)));
      if (!assignee) throw new AppError("validation_failed", "Assignee must be a Member of the Group");
    }

    const queue = await tx
      .select({ position: chores.position, dueDate: chores.dueDate })
      .from(chores)
      .where(eq(chores.groupId, ctx.groupId))
      .orderBy(asc(sql`${chores.position} collate "C"`), asc(chores.id));

    const chore = {
      id: newId(),
      title: input.title,
      note: input.note,
      dueDate: input.dueDate,
      assigneeId: input.assigneeId,
      position: seedPosition(queue, { dueDate: input.dueDate, ...(input.placement ? { placement: input.placement } : {}) }),
    };
    await tx.insert(chores).values({ ...chore, groupId: ctx.groupId });
    return { chore, revision: group.revision };
  });
}
