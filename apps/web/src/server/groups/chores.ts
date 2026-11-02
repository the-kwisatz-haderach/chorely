import { and, asc, eq, sql } from "drizzle-orm";
import { seedPosition } from "@chorely/domain";
import { choreIdSchema, type AddChoreInput, type AddChoreResponse, type ChoreDto, type ChoreResponse, type QueueResponse } from "@chorely/api-client";
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

type Tx = Parameters<Parameters<MemberContext["db"]["transaction"]>[0]>[0];

function choreNotFound(): AppError {
  return new AppError("not_found", "Chore not found");
}

/**
 * Runs an Assignee change on one Chore. Bumping the revision first takes the Group row lock, so competing
 * Claims run one after another and `change` sees the Chore as the previous winner left it. Throwing from
 * `change` rolls the bump back.
 */
async function changeAssignee(
  ctx: MemberContext,
  choreId: string,
  change: (tx: Tx, chore: ChoreDto) => Promise<string | null>,
): Promise<ChoreResponse> {
  if (!choreIdSchema.safeParse(choreId).success) throw choreNotFound();
  return ctx.db.transaction(async (tx) => {
    const [group] = await tx
      .update(groups)
      .set({ revision: sql`${groups.revision} + 1` })
      .where(eq(groups.id, ctx.groupId))
      .returning({ revision: groups.revision });
    if (!group) throw groupNotFound();

    const [chore] = await tx
      .select(choreColumns)
      .from(chores)
      .where(and(eq(chores.id, choreId), eq(chores.groupId, ctx.groupId)));
    if (!chore) throw choreNotFound();

    const assigneeId = await change(tx, chore);
    await tx.update(chores).set({ assigneeId }).where(eq(chores.id, choreId));
    return { chore: { ...chore, assigneeId }, revision: group.revision };
  });
}

/** Takes an unassigned Chore. A lost race, or a Chore someone else holds, is a `conflict`. */
export function claimChore(ctx: MemberContext, choreId: string): Promise<ChoreResponse> {
  return changeAssignee(ctx, choreId, async (_tx, chore) => {
    if (chore.assigneeId && chore.assigneeId !== ctx.memberId) {
      throw new AppError("conflict", "Someone else already claimed this Chore");
    }
    return ctx.memberId;
  });
}

/** Gives up a Chore the caller holds. */
export function unclaimChore(ctx: MemberContext, choreId: string): Promise<ChoreResponse> {
  return changeAssignee(ctx, choreId, async (_tx, chore) => {
    if (chore.assigneeId !== ctx.memberId) throw new AppError("conflict", "You are not assigned to this Chore");
    return null;
  });
}

/** Assigns or reassigns the Chore to any Member of the Group, or unassigns it with null. */
export function assignChore(ctx: MemberContext, choreId: string, assigneeId: string | null): Promise<ChoreResponse> {
  return changeAssignee(ctx, choreId, async (tx) => {
    if (assigneeId) {
      const [member] = await tx
        .select({ id: members.id })
        .from(members)
        .where(and(eq(members.id, assigneeId), eq(members.groupId, ctx.groupId)));
      if (!member) throw new AppError("validation_failed", "Assignee must be a Member of the Group");
    }
    return assigneeId;
  });
}
