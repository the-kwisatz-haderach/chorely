import { and, desc, eq, inArray, isNotNull, isNull, lt, ne, or, sql } from "drizzle-orm";
import { positionBetween, seedPosition } from "@chorely/domain";
import {
  choreIdSchema,
  deleteChoreQuerySchema,
  doneQuerySchema,
  type AddChoreInput,
  type AddChoreResponse,
  type ChoreDto,
  type ChoreResponse,
  type DeleteChoreResponse,
  type CompleteChoreResponse,
  type DoneListResponse,
  type MoveChoreInput,
  type QueueResponse,
  type RecurrenceDto,
  type RevisionResponse,
  type UpdateChoreInput,
} from "@chorely/api-client";
import { chores, groups, members, recurrences } from "../db/schema";
import { AppError } from "../http";
import { newId } from "../ids";
import type { MemberContext } from "./context";
import { groupNotFound } from "./data";
import { openQueue, queueOrder, reverseQueueOrder, type Tx } from "./queue";
import { beforeUndo, localToday, onComplete, onSkip, stop, toRecurrenceDto } from "./recurring";

/** Chore data access. Every Chore mutation bumps the Group revision in the same transaction. */

/** A Chore as stored; `withRecurrence` turns `recurrenceId` into the contract's `recurrence`. */
const choreColumns = {
  id: chores.id,
  title: chores.title,
  note: chores.note,
  dueDate: chores.dueDate,
  assigneeId: chores.assigneeId,
  position: chores.position,
  recurrenceId: chores.recurrenceId,
};

type ChoreRow = Omit<ChoreDto, "recurrence"> & { recurrenceId: string | null };

/** The open Chores of the Group in Queue order: `(position, id)`, byte-wise. */
export async function getQueue(ctx: MemberContext): Promise<QueueResponse> {
  return ctx.db.transaction(async (tx) => {
    const [group] = await tx.select({ revision: groups.revision }).from(groups).where(eq(groups.id, ctx.groupId));
    if (!group) throw groupNotFound();
    const rows = await tx
      .select(choreColumns)
      .from(chores)
      .where(and(eq(chores.groupId, ctx.groupId), isNull(chores.completedAt)))
      .orderBy(...queueOrder);
    return { chores: await withRecurrence(tx, rows), revision: group.revision };
  });
}

/** The Group revision on its own, for clients polling for changes without reading the Queue. */
export async function getRevision(ctx: MemberContext): Promise<RevisionResponse> {
  const [group] = await ctx.db.select({ revision: groups.revision }).from(groups).where(eq(groups.id, ctx.groupId));
  if (!group) throw groupNotFound();
  return group;
}

export async function addChore(ctx: MemberContext, input: AddChoreInput): Promise<AddChoreResponse> {
  return ctx.db.transaction(async (tx) => {
    // Bumping first takes the Group row lock, which serialises adds so each reads the Queue it inserts into.
    const group = await bumpRevision(tx, ctx);

    if (input.assigneeId) await requireAssignee(tx, ctx, input.assigneeId);
    const recurrenceId = input.recurrence && (await insertRecurrence(tx, ctx, input.recurrence));

    const chore = {
      id: newId(),
      title: input.title,
      note: input.note,
      dueDate: input.dueDate,
      assigneeId: input.assigneeId,
      position: seedPosition(await openQueue(tx, ctx), {
        dueDate: input.dueDate,
        ...(input.placement ? { placement: input.placement } : {}),
      }),
    };
    await tx.insert(chores).values({ ...chore, groupId: ctx.groupId, recurrenceId });
    return { chore: { ...chore, recurrence: input.recurrence }, revision: group.revision };
  });
}

/** Turns stored rows' `recurrenceId` into the contract's `recurrence`, with one query for all of them. */
async function withRecurrence<R extends { recurrenceId: string | null }>(
  db: Tx | MemberContext["db"],
  rows: R[],
): Promise<Array<Omit<R, "recurrenceId"> & { recurrence: RecurrenceDto | null }>> {
  const ids = [...new Set(rows.flatMap((r) => (r.recurrenceId ? [r.recurrenceId] : [])))];
  const found = ids.length ? await db.select().from(recurrences).where(inArray(recurrences.id, ids)) : [];
  const byId = new Map(found.map((r) => [r.id, toRecurrenceDto(r)]));
  return rows.map(({ recurrenceId, ...row }) => ({ ...row, recurrence: (recurrenceId && byId.get(recurrenceId)) || null }));
}

/** `withRecurrence` for one row. */
async function oneWithRecurrence<R extends { recurrenceId: string | null }>(db: Tx | MemberContext["db"], row: R) {
  const [dto] = await withRecurrence(db, [row]);
  return dto!;
}

function recurrenceColumns(r: RecurrenceDto) {
  return {
    unit: r.unit,
    every: r.every,
    anchor: r.anchor,
    assigneeId: r.assigneeId,
    weekdays: r.unit === "week" ? r.weekdays : null,
    dayOfMonth: r.unit === "month" ? r.dayOfMonth : null,
  };
}

/** Stores a new schedule, checking its fixed Assignee. */
async function insertRecurrence(tx: Tx, ctx: MemberContext, recurrence: RecurrenceDto): Promise<string> {
  if (recurrence.assigneeId) await requireAssignee(tx, ctx, recurrence.assigneeId);
  const id = newId();
  await tx.insert(recurrences).values({ id, groupId: ctx.groupId, ...recurrenceColumns(recurrence) });
  return id;
}

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

/** Rejects an Assignee who is not a current Member of this Group; a Former member has no Account. */
async function requireAssignee(tx: Tx, ctx: MemberContext, memberId: string): Promise<void> {
  const [member] = await tx
    .select({ id: members.id })
    .from(members)
    .where(and(eq(members.id, memberId), eq(members.groupId, ctx.groupId), isNotNull(members.accountId)));
  if (!member) throw new AppError("validation_failed", "Assignee must be a Member of the Group");
}

function choreNotFound(): AppError {
  return new AppError("not_found", "Chore not found");
}

function alreadyDone(): AppError {
  return new AppError("conflict", "This Chore is already done");
}

/** Takes an unassigned Chore. A lost race, or a Chore someone else holds, is a `conflict`. */
export function claimChore(ctx: MemberContext, choreId: string): Promise<ChoreResponse> {
  return changeOpenChore(ctx, choreId, async (_tx, chore) => {
    if (chore.assigneeId && chore.assigneeId !== ctx.memberId) {
      throw new AppError("conflict", "Someone else already claimed this Chore");
    }
    return { assigneeId: ctx.memberId };
  });
}

/** Gives up a Chore the caller holds. */
export function unclaimChore(ctx: MemberContext, choreId: string): Promise<ChoreResponse> {
  return changeOpenChore(ctx, choreId, async (_tx, chore) => {
    if (chore.assigneeId !== ctx.memberId) throw new AppError("conflict", "You are not assigned to this Chore");
    return { assigneeId: null };
  });
}

/** Assigns or reassigns the Chore to any Member of the Group, or unassigns it with null. */
export function assignChore(ctx: MemberContext, choreId: string, assigneeId: string | null): Promise<ChoreResponse> {
  return changeOpenChore(ctx, choreId, async (tx) => {
    if (assigneeId) await requireAssignee(tx, ctx, assigneeId);
    return { assigneeId };
  });
}

/** Loads a Chore of this Group that is still open, or throws `not_found` / `conflict` (already done). */
async function requireOpenChore(tx: Tx, ctx: MemberContext, choreId: string): Promise<ChoreRow> {
  if (!choreIdSchema.safeParse(choreId).success) throw choreNotFound();
  const [chore] = await tx
    .select({ ...choreColumns, completedAt: chores.completedAt })
    .from(chores)
    .where(and(eq(chores.id, choreId), eq(chores.groupId, ctx.groupId)));
  if (!chore) throw choreNotFound();
  const { completedAt, ...dto } = chore;
  if (completedAt) throw alreadyDone();
  return dto;
}

/** The columns a Member's change to an open Chore may set. */
type ChoreChanges = Partial<Pick<typeof chores.$inferInsert, "title" | "note" | "dueDate" | "assigneeId" | "position" | "recurrenceId">>;

/**
 * Runs a Member's change to one open Chore: assign, claim, unclaim, edit or move. Bumping the revision first takes
 * the Group row lock, so competing changes run one after another and `change` sees the Chore as the previous winner
 * left it; throwing from `change` rolls the bump back. The Chore is marked `changed`, so an Undo of the completion
 * that created it as the next Occurrence will not delete it.
 */
async function changeOpenChore(
  ctx: MemberContext,
  choreId: string,
  change: (tx: Tx, chore: ChoreRow) => Promise<ChoreChanges>,
): Promise<ChoreResponse> {
  return ctx.db.transaction(async (tx) => {
    const group = await bumpRevision(tx, ctx);
    const chore = await requireOpenChore(tx, ctx, choreId);
    const changes = await change(tx, chore);
    // An edit with nothing in it changes nothing, so it leaves the Chore for Undo to take back.
    if (Object.keys(changes).length > 0) await tx.update(chores).set({ ...changes, changed: true }).where(eq(chores.id, choreId));
    const dto = await oneWithRecurrence(tx, { ...chore, ...changes });
    return { chore: dto, revision: group.revision };
  });
}

/**
 * Edits an open Chore for any Member. Only the fields present change, and `position` is never touched, so a
 * new Due date does not move the Chore.
 *
 * A `recurrence` changes the shared schedule, which only the next Occurrences use. Null is "Stop repeating": the
 * schedule is deleted, so this and every past Occurrence become one-offs.
 */
export function updateChore(ctx: MemberContext, choreId: string, input: UpdateChoreInput): Promise<ChoreResponse> {
  return changeOpenChore(ctx, choreId, async (tx, chore) => {
    if (input.assigneeId) await requireAssignee(tx, ctx, input.assigneeId);

    let recurrenceId = chore.recurrenceId;
    if (input.recurrence === null && recurrenceId) {
      await stop(tx, recurrenceId);
      recurrenceId = null;
    } else if (input.recurrence && recurrenceId) {
      if (input.recurrence.assigneeId) await requireAssignee(tx, ctx, input.recurrence.assigneeId);
      await tx.update(recurrences).set(recurrenceColumns(input.recurrence)).where(eq(recurrences.id, recurrenceId));
    } else if (input.recurrence) {
      recurrenceId = await insertRecurrence(tx, ctx, input.recurrence);
    }

    return {
      ...(input.title !== undefined && { title: input.title }),
      ...(input.note !== undefined && { note: input.note }),
      ...(input.dueDate !== undefined && { dueDate: input.dueDate }),
      ...(input.assigneeId !== undefined && { assigneeId: input.assigneeId }),
      ...(recurrenceId !== chore.recurrenceId && { recurrenceId }),
    };
  });
}

type Anchor = { id: string; position: string };

function queueChanged(): AppError {
  return new AppError("conflict", "The Queue changed while you were moving this Chore");
}

/** An anchor's key, open or completed (a completed Chore keeps its key). Undefined when it is gone or not ours. */
async function findAnchor(tx: Tx, ctx: MemberContext, id: string): Promise<Anchor | undefined> {
  const [anchor] = await tx
    .select({ id: chores.id, position: chores.position })
    .from(chores)
    .where(and(eq(chores.id, id), eq(chores.groupId, ctx.groupId)));
  return anchor;
}

/**
 * The open Chore right after (or before) `anchor` in Queue order, skipping the Chore being moved. Without an
 * anchor it is the first (or last) open Chore.
 */
async function openNeighbour(tx: Tx, ctx: MemberContext, movingId: string, side: "after" | "before", anchor?: Anchor) {
  const key = sql`(${chores.position} collate "C", ${chores.id})`;
  const anchorKey = anchor && sql`(${anchor.position} collate "C", ${anchor.id}::uuid)`;
  const [row] = await tx
    .select({ id: chores.id, position: chores.position })
    .from(chores)
    .where(
      and(
        eq(chores.groupId, ctx.groupId),
        isNull(chores.completedAt),
        ne(chores.id, movingId),
        anchorKey && (side === "after" ? sql`${key} > ${anchorKey}` : sql`${key} < ${anchorKey}`),
      ),
    )
    .orderBy(...(side === "after" ? queueOrder : reverseQueueOrder))
    .limit(1);
  return row;
}

/**
 * The key for a move between two anchors. If the pair is unusable (one was hard-deleted, or they are tied or no
 * longer in order because of another move) the Chore lands right beside a surviving anchor instead. Only when
 * no anchor is left is it a `conflict`.
 */
async function keyBetweenAnchors(tx: Tx, ctx: MemberContext, movingId: string, input: { afterId: string; beforeId: string }) {
  const after = await findAnchor(tx, ctx, input.afterId);
  const before = await findAnchor(tx, ctx, input.beforeId);
  if (!after && !before) throw queueChanged();
  const between = after && before && positionBetween(after.position, before.position);
  if (between) return between;
  if (after) {
    const next = await openNeighbour(tx, ctx, movingId, "after", after);
    const key = positionBetween(after.position, next?.position ?? null);
    if (key) return key;
  }
  if (before) {
    const previous = await openNeighbour(tx, ctx, movingId, "before", before);
    const key = positionBetween(previous?.position ?? null, before.position);
    if (key) return key;
  }
  throw queueChanged();
}

/**
 * Moves an open Chore and generates its new key (ADR 0002). Omitting `afterId` moves it to the front of the
 * Queue and omitting `beforeId` to the back, whatever the Queue looks like now; with both it goes between them.
 * Concurrent moves of one Chore are last-write-wins.
 */
export async function moveChore(ctx: MemberContext, choreId: string, input: MoveChoreInput): Promise<ChoreResponse> {
  const { afterId, beforeId } = input;
  if (afterId === choreId || beforeId === choreId) {
    throw new AppError("validation_failed", "A Chore cannot be anchored on itself");
  }
  return changeOpenChore(ctx, choreId, async (tx) => {
    let position: string | undefined;
    if (afterId && beforeId) {
      position = await keyBetweenAnchors(tx, ctx, choreId, { afterId, beforeId });
    } else if (beforeId) {
      const first = await openNeighbour(tx, ctx, choreId, "after");
      position = positionBetween(null, first?.position ?? null);
    } else {
      const last = await openNeighbour(tx, ctx, choreId, "before");
      position = positionBetween(last?.position ?? null, null);
    }
    if (position === undefined) throw queueChanged();
    return { position };
  });
}

/**
 * Permanently deletes an open Chore. A completed Chore stays in the Done list, so it is a `conflict`. Deleting an
 * Occurrence of a Recurring Chore skips it ("Delete this one"): the next Occurrence is created as on completion,
 * counting from `today`. With `stopRepeating` the schedule is deleted instead, and nothing comes back.
 */
export async function deleteChore(
  ctx: MemberContext,
  choreId: string,
  rawQuery: { stopRepeating?: string | undefined; today?: string | undefined },
): Promise<DeleteChoreResponse> {
  const parsed = deleteChoreQuerySchema.safeParse(rawQuery);
  if (!parsed.success) throw new AppError("validation_failed", "Invalid delete query");
  const today = localToday(ctx, parsed.data.today);
  return ctx.db.transaction(async (tx) => {
    const group = await bumpRevision(tx, ctx);
    const chore = await requireOpenChore(tx, ctx, choreId);
    await tx.delete(chores).where(eq(chores.id, choreId));

    if (chore.recurrenceId && parsed.data.stopRepeating) {
      await stop(tx, chore.recurrenceId);
      return { revision: group.revision, next: null };
    }
    return { revision: group.revision, next: await onSkip(tx, ctx, chore, today) };
  });
}

const doneColumns = { ...choreColumns, completedAt: chores.completedAt, completedById: chores.completedById };

type DoneRow = Omit<ChoreDto, "recurrence"> & { completedAt: Date | null; completedById: string | null };

function toDoneDto<R extends DoneRow>(row: R): Omit<R, "completedAt"> & { completedAt: string } {
  return { ...row, completedAt: row.completedAt!.toISOString() };
}

/**
 * Completes an open Chore for any Member, recording who and when. The Chore keeps its `position`, so Undo
 * puts it back where it was. Bumping the revision first takes the Group row lock, so completing twice
 * loses cleanly with a `conflict`. Completing an Occurrence of a Recurring Chore creates the next one in the
 * same transaction, its Due date counted from the Member's local `today`.
 */
export async function completeChore(
  ctx: MemberContext,
  choreId: string,
  input: { today?: string | undefined },
): Promise<CompleteChoreResponse> {
  if (!choreIdSchema.safeParse(choreId).success) throw choreNotFound();
  const today = localToday(ctx, input.today);
  return ctx.db.transaction(async (tx) => {
    const group = await bumpRevision(tx, ctx);

    const [row] = await tx
      .update(chores)
      .set({ completedAt: ctx.now(), completedById: ctx.memberId })
      .where(and(eq(chores.id, choreId), eq(chores.groupId, ctx.groupId), isNull(chores.completedAt)))
      .returning(doneColumns);
    if (!row) {
      const [existing] = await tx
        .select({ id: chores.id })
        .from(chores)
        .where(and(eq(chores.id, choreId), eq(chores.groupId, ctx.groupId)));
      throw existing ? alreadyDone() : choreNotFound();
    }
    const next = await onComplete(tx, ctx, row, today);
    const done = await oneWithRecurrence(tx, toDoneDto(row));
    return { chore: done, next, revision: group.revision };
  });
}

/**
 * Reopens a completed Chore at its retained Position. There is no time limit here; the Undo window is client-side.
 * The Occurrence its completion created is deleted first (`beforeUndo`), which may make the Undo a `conflict`.
 */
export async function undoCompleteChore(ctx: MemberContext, choreId: string): Promise<ChoreResponse> {
  if (!choreIdSchema.safeParse(choreId).success) throw choreNotFound();
  return ctx.db.transaction(async (tx) => {
    const group = await bumpRevision(tx, ctx);

    await beforeUndo(tx, ctx, choreId);

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
    const dto = await oneWithRecurrence(tx, chore);
    return { chore: dto, revision: group.revision };
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

  // A completer who has left keeps their Member row without an Account; the contract shows them as null.
  const rows = await ctx.db
    .select({ ...doneColumns, completedById: sql<string | null>`case when ${members.accountId} is null then null else ${chores.completedById} end` })
    .from(chores)
    .leftJoin(members, eq(members.id, chores.completedById))
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
    chores: await withRecurrence(ctx.db, page.map(toDoneDto)),
    nextCursor: rows.length > limit && last ? `${last.completedAt!.toISOString()}_${last.id}` : null,
  };
}
