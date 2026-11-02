import { and, asc, desc, eq, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import { seedPosition } from "@chorely/domain";
import {
  choreIdSchema,
  doneQuerySchema,
  type AddChoreInput,
  type AddChoreResponse,
  type ChoreDto,
  type ChoreResponse,
  type DeleteChoreResponse,
  type CompleteChoreResponse,
  type DoneListResponse,
  type QueueResponse,
  type UpdateChoreInput,
} from "@chorely/api-client";
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
      .where(and(eq(chores.groupId, ctx.groupId), isNull(chores.completedAt)))
      .orderBy(asc(sql`${chores.position} collate "C"`), asc(chores.id));
    return { chores: rows, revision: group.revision };
  });
}

export async function addChore(ctx: MemberContext, input: AddChoreInput): Promise<AddChoreResponse> {
  return ctx.db.transaction(async (tx) => {
    // Bumping first takes the Group row lock, which serialises adds so each reads the Queue it inserts into.
    const group = await bumpRevision(tx, ctx);

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
      .where(and(eq(chores.groupId, ctx.groupId), isNull(chores.completedAt)))
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

/** Bumps the Group revision. As the first write of a mutation it also takes the Group row lock. */
async function bumpRevision(tx: Tx, ctx: MemberContext): Promise<{ revision: number }> {
  const [group] = await tx
    .update(groups)
    .set({ revision: sql`${groups.revision} + 1` })
    .where(eq(groups.id, ctx.groupId))
    .returning({ revision: groups.revision });
  if (!group) throw groupNotFound();
  return group;
}

function choreNotFound(): AppError {
  return new AppError("not_found", "Chore not found");
}

function alreadyDone(): AppError {
  return new AppError("conflict", "This Chore is already done");
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
    const group = await bumpRevision(tx, ctx);

    const [chore] = await tx
      .select({ ...choreColumns, completedAt: chores.completedAt })
      .from(chores)
      .where(and(eq(chores.id, choreId), eq(chores.groupId, ctx.groupId)));
    if (!chore) throw choreNotFound();
    if (chore.completedAt) throw alreadyDone();

    const assigneeId = await change(tx, chore);
    await tx.update(chores).set({ assigneeId }).where(eq(chores.id, choreId));
    const { id, title, note, dueDate, position } = chore;
    return { chore: { id, title, note, dueDate, position, assigneeId }, revision: group.revision };
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

/** Loads a Chore of this Group that is still open, or throws `not_found` / `conflict` (already done). */
async function requireOpenChore(tx: Tx, ctx: MemberContext, choreId: string): Promise<ChoreDto> {
  const [chore] = await tx
    .select({ ...choreColumns, completedAt: chores.completedAt })
    .from(chores)
    .where(and(eq(chores.id, choreId), eq(chores.groupId, ctx.groupId)));
  if (!chore) throw choreNotFound();
  if (chore.completedAt) throw alreadyDone();
  const { completedAt: _, ...dto } = chore;
  return dto;
}

/**
 * Edits an open Chore for any Member. Only the fields present change, and `position` is never touched, so a
 * new Due date does not move the Chore. Bumping the revision first takes the Group row lock.
 */
export async function updateChore(ctx: MemberContext, choreId: string, input: UpdateChoreInput): Promise<ChoreResponse> {
  if (!choreIdSchema.safeParse(choreId).success) throw choreNotFound();
  return ctx.db.transaction(async (tx) => {
    const group = await bumpRevision(tx, ctx);
    const chore = await requireOpenChore(tx, ctx, choreId);

    if (input.assigneeId) {
      const [member] = await tx
        .select({ id: members.id })
        .from(members)
        .where(and(eq(members.id, input.assigneeId), eq(members.groupId, ctx.groupId)));
      if (!member) throw new AppError("validation_failed", "Assignee must be a Member of the Group");
    }

    const changes = {
      ...(input.title !== undefined && { title: input.title }),
      ...(input.note !== undefined && { note: input.note }),
      ...(input.dueDate !== undefined && { dueDate: input.dueDate }),
      ...(input.assigneeId !== undefined && { assigneeId: input.assigneeId }),
    };
    if (Object.keys(changes).length > 0) await tx.update(chores).set(changes).where(eq(chores.id, choreId));
    return { chore: { ...chore, ...changes }, revision: group.revision };
  });
}

/** Permanently deletes an open Chore. A completed Chore stays in the Done list, so it is a `conflict`. */
export async function deleteChore(ctx: MemberContext, choreId: string): Promise<DeleteChoreResponse> {
  if (!choreIdSchema.safeParse(choreId).success) throw choreNotFound();
  return ctx.db.transaction(async (tx) => {
    const group = await bumpRevision(tx, ctx);
    await requireOpenChore(tx, ctx, choreId);
    await tx.delete(chores).where(eq(chores.id, choreId));
    return { revision: group.revision };
  });
}

const doneColumns = { ...choreColumns, completedAt: chores.completedAt, completedById: chores.completedById };

type DoneRow = ChoreDto & { completedAt: Date | null; completedById: string | null };

function toDoneDto(row: DoneRow): CompleteChoreResponse["chore"] {
  return { ...row, completedAt: row.completedAt!.toISOString() };
}

/**
 * Completes an open Chore for any Member, recording who and when. The Chore keeps its `position`, so Undo
 * puts it back where it was. Bumping the revision first takes the Group row lock, so completing twice
 * loses cleanly with a `conflict`.
 */
export async function completeChore(ctx: MemberContext, choreId: string): Promise<CompleteChoreResponse> {
  if (!choreIdSchema.safeParse(choreId).success) throw choreNotFound();
  return ctx.db.transaction(async (tx) => {
    const group = await bumpRevision(tx, ctx);

    const [row] = await tx
      .update(chores)
      .set({ completedAt: new Date(), completedById: ctx.memberId })
      .where(and(eq(chores.id, choreId), eq(chores.groupId, ctx.groupId), isNull(chores.completedAt)))
      .returning(doneColumns);
    if (!row) {
      const [existing] = await tx
        .select({ id: chores.id })
        .from(chores)
        .where(and(eq(chores.id, choreId), eq(chores.groupId, ctx.groupId)));
      throw existing ? alreadyDone() : choreNotFound();
    }
    return { chore: toDoneDto(row), revision: group.revision };
  });
}

/** Reopens a completed Chore at its retained Position. There is no time limit here; the Undo window is client-side. */
export async function undoCompleteChore(ctx: MemberContext, choreId: string): Promise<ChoreResponse> {
  if (!choreIdSchema.safeParse(choreId).success) throw choreNotFound();
  return ctx.db.transaction(async (tx) => {
    const group = await bumpRevision(tx, ctx);

    const [chore] = await tx
      .update(chores)
      .set({ completedAt: null, completedById: null })
      .where(and(eq(chores.id, choreId), eq(chores.groupId, ctx.groupId), isNotNull(chores.completedAt)))
      .returning(choreColumns);
    if (!chore) {
      const [existing] = await tx
        .select({ id: chores.id })
        .from(chores)
        .where(and(eq(chores.id, choreId), eq(chores.groupId, ctx.groupId)));
      throw existing ? new AppError("conflict", "This Chore is not done") : choreNotFound();
    }
    return { chore, revision: group.revision };
  });
}

/** A cursor is the last row's `completedAt` (ms ISO) and id, which is exactly the sort key. */
const CURSOR = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)_([0-9a-f-]{36})$/;

/** Completed Chores, newest first by `(completedAt, id)`, keyset-paginated so new completions never shift a page. */
export async function getDoneList(ctx: MemberContext, rawQuery: { cursor?: string | undefined; limit?: string | undefined }): Promise<DoneListResponse> {
  const parsed = doneQuerySchema.safeParse(rawQuery);
  if (!parsed.success) throw new AppError("validation_failed", "Invalid Done list query");
  const { cursor, limit } = parsed.data;

  let after: { at: Date; id: string } | undefined;
  if (cursor !== undefined) {
    const match = CURSOR.exec(cursor);
    if (!match) throw new AppError("validation_failed", "Invalid cursor");
    after = { at: new Date(match[1]!), id: match[2]! };
  }

  const rows = await ctx.db
    .select(doneColumns)
    .from(chores)
    .where(
      and(
        eq(chores.groupId, ctx.groupId),
        isNotNull(chores.completedAt),
        after
          ? or(lt(chores.completedAt, after.at), and(eq(chores.completedAt, after.at), lt(chores.id, after.id)))
          : undefined,
      ),
    )
    .orderBy(desc(chores.completedAt), desc(chores.id))
    .limit(limit + 1);

  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  return {
    chores: page.map(toDoneDto),
    nextCursor: rows.length > limit && last ? `${last.completedAt!.toISOString()}_${last.id}` : null,
  };
}
