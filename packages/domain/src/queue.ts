import { generateKeyBetween } from "fractional-indexing";

/** An open Chore as the Queue sees it. The Queue is ordered by position (byte order), then id. */
export interface QueuedChore {
  position: string;
  /** Date-only, `YYYY-MM-DD`. */
  dueDate: string | null;
}

export interface SeedInput {
  dueDate: string | null;
  /** A manual placement, which always overrides the Due-date seeding. */
  placement?: "front" | "back";
}

/**
 * The Position for a new Chore (ADR 0002). `queue` is the open Chores in Queue order.
 * Without a manual placement, a dated Chore goes before the first Chore with a later Due date
 * (undated Chores are skipped, ties go after the existing Chore); otherwise it goes to the back.
 */
export function seedPosition(queue: readonly QueuedChore[], { dueDate, placement }: SeedInput): string {
  const first = queue[0];
  const last = queue.at(-1);
  if (!first || !last) return generateKeyBetween(null, null);
  if (placement === "front") return generateKeyBetween(null, first.position);
  if (placement === "back") return generateKeyBetween(last.position, null);

  const later = dueDate === null ? -1 : queue.findIndex((c) => c.dueDate !== null && c.dueDate > dueDate);
  if (later === -1) return generateKeyBetween(last.position, null);
  return generateKeyBetween(queue[later - 1]?.position ?? null, queue[later]?.position ?? null);
}

/**
 * The Position for a Chore moved between two anchors' keys (ADR 0002). `null` is an open end: the front when
 * `after` is null, the back when `before` is null. Out-of-order or tied anchors have no key strictly between
 * them, so this returns undefined and the caller treats the move as a conflict.
 */
export function positionBetween(after: string | null, before: string | null): string | undefined {
  if (after !== null && before !== null && after >= before) return undefined;
  return generateKeyBetween(after, before);
}
