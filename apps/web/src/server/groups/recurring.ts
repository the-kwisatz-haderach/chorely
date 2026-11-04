import { and, eq, isNull, ne } from "drizzle-orm";
import { nextDueDate, seedPosition, type Weekday } from "@chorely/domain";
import type { ChoreDto, RecurrenceDto } from "@chorely/api-client";
import { chores, recurrences } from "../db/schema";
import { AppError } from "../http";
import { newId } from "../ids";
import type { MemberContext } from "./context";
import { openQueue, type Tx } from "./queue";

/**
 * The rules of a Recurring Chore's Occurrences: the one open Occurrence at a time, the next one's Due date, and the
 * `previousOccurrenceId` link that lets Undo take back the Occurrence a completion created. `onComplete`,
 * `beforeUndo`, `onSkip` and `stop` run inside a Chore transaction that already holds the Group lock.
 */

/** An Occurrence as the Chore mutations hand it over: the fields the next Occurrence copies. */
export interface Occurrence {
  id: string;
  title: string;
  note: string;
  dueDate: string | null;
  recurrenceId: string | null;
}

export function toRecurrenceDto(r: typeof recurrences.$inferSelect): RecurrenceDto {
  const common = { every: r.every, anchor: r.anchor, assigneeId: r.assigneeId };
  if (r.unit === "week") return { unit: "week", weekdays: (r.weekdays ?? []) as Weekday[], ...common };
  if (r.unit === "month") return { unit: "month", dayOfMonth: r.dayOfMonth ?? 1, ...common };
  return { unit: "day", ...common };
}

/**
 * The Member's local date, which a next Occurrence's Due date counts from. Time zones put it at most a day either
 * side of the server's UTC date; without one, that UTC date is used.
 */
export function localToday(ctx: MemberContext, today: string | undefined): string {
  const utc = ctx.now().toISOString().slice(0, 10);
  if (today === undefined) return utc;
  if (Math.abs(Date.parse(today) - Date.parse(utc)) > 86_400_000) {
    throw new AppError("validation_failed", "today must be your local date");
  }
  return today;
}

/** After `done` was completed: creates the next Occurrence, linked back so Undo can remove it. Null for a one-off. */
export function onComplete(tx: Tx, ctx: MemberContext, done: Occurrence, today: string): Promise<ChoreDto | null> {
  return createNext(tx, ctx, done, today, done.id);
}

/** After `skipped` was deleted ("Delete this one"): creates the next Occurrence, which no Undo removes. */
export function onSkip(tx: Tx, ctx: MemberContext, skipped: Occurrence, today: string): Promise<ChoreDto | null> {
  return createNext(tx, ctx, skipped, today, null);
}

/** Stop repeating: deletes the schedule, which leaves every Occurrence of it as a one-off. */
export async function stop(tx: Tx, recurrenceId: string): Promise<void> {
  await tx.delete(recurrences).where(eq(recurrences.id, recurrenceId));
}

/**
 * Before reopening the completed Chore `choreId`: deletes the Occurrence its completion created, so the series
 * keeps one open Occurrence. Undo is a `conflict` when that Occurrence is done, when a Member has changed it or
 * made it a one-off (deleting it would lose their change), or when it was skipped so another is open.
 */
export async function beforeUndo(tx: Tx, ctx: MemberContext, choreId: string): Promise<void> {
  const [done] = await tx
    .select({ recurrenceId: chores.recurrenceId })
    .from(chores)
    .where(and(eq(chores.id, choreId), eq(chores.groupId, ctx.groupId)));
  if (!done) return;

  const [next] = await tx
    .select({ id: chores.id, completedAt: chores.completedAt, changed: chores.changed, recurrenceId: chores.recurrenceId })
    .from(chores)
    .where(and(eq(chores.previousOccurrenceId, choreId), eq(chores.groupId, ctx.groupId)));
  if (next) {
    if (next.completedAt) throw new AppError("conflict", "The next Occurrence is already done, so this cannot be undone");
    if (next.changed || !next.recurrenceId || next.recurrenceId !== done.recurrenceId) {
      throw new AppError("conflict", "The next Occurrence was changed, so this can't be undone");
    }
    await tx.delete(chores).where(eq(chores.id, next.id));
  }

  if (!done.recurrenceId) return;
  const [open] = await tx
    .select({ id: chores.id })
    .from(chores)
    .where(
      and(eq(chores.groupId, ctx.groupId), eq(chores.recurrenceId, done.recurrenceId), isNull(chores.completedAt), ne(chores.id, choreId)),
    );
  if (open) throw new AppError("conflict", "A later Occurrence of this Chore is already in the Queue, so this cannot be undone");
}

/**
 * The next Occurrence after `previous`: same title and note, the next Due date, the series' fixed Assignee (or
 * none), placed by the usual Due-date seeding with no memory of the old Position.
 */
async function createNext(
  tx: Tx,
  ctx: MemberContext,
  previous: Occurrence,
  today: string,
  previousOccurrenceId: string | null,
): Promise<ChoreDto | null> {
  if (!previous.recurrenceId) return null;
  const [row] = await tx.select().from(recurrences).where(eq(recurrences.id, previous.recurrenceId));
  if (!row) throw new Error("An Occurrence points at a missing schedule");
  const recurrence = toRecurrenceDto(row);
  const dueDate = nextDueDate(recurrence, { dueDate: previous.dueDate, today });
  const next = {
    id: newId(),
    title: previous.title,
    note: previous.note,
    dueDate,
    assigneeId: recurrence.assigneeId,
    position: seedPosition(await openQueue(tx, ctx), { dueDate }),
  };
  await tx.insert(chores).values({ ...next, groupId: ctx.groupId, recurrenceId: previous.recurrenceId, previousOccurrenceId });
  return { ...next, recurrence };
}
