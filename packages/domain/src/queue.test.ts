import { describe, expect, it } from "vitest";
import { seedPosition, type QueuedChore } from "./queue";

const chore = (position: string, dueDate: string | null = null): QueuedChore => ({ position, dueDate });

/** Builds a Queue by inserting each entry the way the server would. */
function build(entries: Array<{ dueDate?: string; front?: boolean }>): QueuedChore[] {
  const queue: QueuedChore[] = [];
  for (const { dueDate = null, front } of entries) {
    const position = seedPosition(queue, { dueDate, ...(front === undefined ? {} : { placement: front ? "front" : "back" }) });
    queue.push({ position, dueDate });
    queue.sort((a, b) => (a.position < b.position ? -1 : a.position > b.position ? 1 : 0));
  }
  return queue;
}
const dates = (q: QueuedChore[]) => q.map((c) => c.dueDate);

describe("seedPosition", () => {
  it("puts the first Chore in an empty Queue anywhere", () => {
    expect(seedPosition([], { dueDate: null })).toEqual(expect.any(String));
  });

  it("sends an undated Chore to the back by default", () => {
    const q = build([{ dueDate: "2030-01-01" }, {}]);
    expect(dates(q)).toEqual(["2030-01-01", null]);
  });

  it("sends an undated Chore to the front when asked", () => {
    const q = build([{ dueDate: "2030-01-01" }, { front: true }]);
    expect(dates(q)).toEqual([null, "2030-01-01"]);
  });

  it("inserts a dated Chore before the first Chore with a later Due date", () => {
    const q = build([{ dueDate: "2030-01-10" }, { dueDate: "2030-01-20" }, { dueDate: "2030-01-15" }]);
    expect(dates(q)).toEqual(["2030-01-10", "2030-01-15", "2030-01-20"]);
  });

  it("skips undated Chores when looking for a later date", () => {
    const q = build([{}, { dueDate: "2030-01-20" }, {}, { dueDate: "2030-01-15" }]);
    expect(dates(q)).toEqual([null, "2030-01-15", "2030-01-20", null]);
  });

  it("places a tie after the existing Chore", () => {
    const q = build([{ dueDate: "2030-01-10" }, { dueDate: "2030-01-10" }]);
    expect(q[0]?.dueDate).toBe("2030-01-10");
    const a = seedPosition([chore("a0", "2030-01-10"), chore("a1", "2030-01-12")], { dueDate: "2030-01-10" });
    expect(a > "a0" && a < "a1").toBe(true);
  });

  it("goes to the back when no open Chore has a later Due date", () => {
    const q = build([{ dueDate: "2030-01-10" }, {}, { dueDate: "2030-01-10" }]);
    expect(dates(q)).toEqual(["2030-01-10", null, "2030-01-10"]);
  });

  it("lets an explicit placement override the Due date", () => {
    const q = build([{ dueDate: "2030-01-10" }, { dueDate: "2030-01-20", front: true }]);
    expect(dates(q)).toEqual(["2030-01-20", "2030-01-10"]);
    const q2 = build([{ dueDate: "2030-01-20" }, { dueDate: "2030-01-10", front: false }]);
    expect(dates(q2)).toEqual(["2030-01-20", "2030-01-10"]);
  });

  it("keeps keys bounded when 200 inserts land in one gap (ADR 0002)", () => {
    const queue = [chore("a0", "2030-01-01"), chore("a1", "2031-01-01")];
    for (let i = 0; i < 200; i++) {
      queue.splice(1, 0, chore(seedPosition(queue, { dueDate: "2030-06-01" }), "2030-06-01"));
      queue.sort((a, b) => (a.position < b.position ? -1 : 1));
    }
    expect(Math.max(...queue.map((c) => c.position.length))).toBeLessThan(60);
  });
});
