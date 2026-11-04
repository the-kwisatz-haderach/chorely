import { afterEach, describe, expect, it } from "vitest";
import type { RecurrenceBody } from "@chorely/api-client";
import { createTestApp, type TestApp } from "./harness";

let app: TestApp;
afterEach(async () => {
  await app.close();
});

/** A Group with Ada and Bob as Members. The app's clock starts on 1 January 2030. */
async function setup() {
  app = await createTestApp();
  const { client: ada } = await app.signedIn("ada@example.com", "Ada");
  const { client: bob } = await app.signedIn("bob@example.com", "Bob");
  const { group } = await ada.createGroup({ name: "Flat 4" });
  await bob.joinGroup({ token: (await ada.createInviteLink(group.id)).token });
  const { members } = await ada.getGroup(group.id);
  const idOf = (name: string) => members.find((m) => m.displayName === name)!.id;
  return { ada, bob, group, adaId: idOf("Ada"), bobId: idOf("Bob") };
}

const weekly: RecurrenceBody = { unit: "week", every: 1, weekdays: [4] };

describe("Recurring Chores (contract, real Postgres)", () => {
  it("creates the next Occurrence on completion, with its Due date and the same title and note", async () => {
    const { ada, bob, group } = await setup();
    const { chore } = await ada.addChore(group.id, { title: "Bins", note: "Blue bag", dueDate: "2030-01-03", recurrence: weekly });
    expect(chore.recurrence).toEqual({ ...weekly, anchor: "calendar", assigneeId: null });

    const done = await bob.completeChore(group.id, chore.id, { today: "2030-01-01" });
    expect(done.next).toMatchObject({ title: "Bins", note: "Blue bag", dueDate: "2030-01-10", assigneeId: null, recurrence: chore.recurrence });
    const queue = await ada.getQueue(group.id);
    expect(queue.chores).toEqual([done.next]);
  });

  it("places the next Occurrence by its Due date, with no memory of the old Position", async () => {
    const { ada, group } = await setup();
    const { chore: bins } = await ada.addChore(group.id, { title: "Bins", dueDate: "2030-01-03", recurrence: weekly, placement: "front" });
    const { chore: early } = await ada.addChore(group.id, { title: "Early", dueDate: "2030-01-05" });
    const { chore: late } = await ada.addChore(group.id, { title: "Late", dueDate: "2030-01-20" });
    const { next } = await ada.completeChore(group.id, bins.id, { today: "2030-01-01" });
    expect((await ada.getQueue(group.id)).chores.map((c) => c.id)).toEqual([early.id, next!.id, late.id]);
  });

  it("counts from the completion day with the completion anchor, and from the server's date without `today`", async () => {
    const { ada, group } = await setup();
    const { chore } = await ada.addChore(group.id, {
      title: "Water plants",
      dueDate: "2029-12-01",
      recurrence: { unit: "day", every: 10, anchor: "completion" },
    });
    const { next } = await ada.completeChore(group.id, chore.id);
    expect(next!.dueDate).toBe("2030-01-11");
  });

  it("accepts a local date a day either side of the server's, and rejects one further off", async () => {
    const { ada, group } = await setup();
    const { chore } = await ada.addChore(group.id, { title: "Bins", recurrence: { unit: "day", every: 1 } });
    await expect(ada.completeChore(group.id, chore.id, { today: "2030-01-03" })).rejects.toMatchObject({ code: "validation_failed" });
    await expect(ada.completeChore(group.id, chore.id, { today: "2030-1-1" })).rejects.toMatchObject({ code: "validation_failed" });
    const { next } = await ada.completeChore(group.id, chore.id, { today: "2029-12-31" });
    expect(next!.dueDate).toBe("2030-01-01");
  });

  it("leaves the next Occurrence unassigned, or gives it the series' fixed Assignee", async () => {
    const { ada, bob, group, adaId, bobId } = await setup();
    const { chore: plain } = await ada.addChore(group.id, { title: "Bins", assigneeId: adaId, recurrence: weekly });
    expect((await ada.completeChore(group.id, plain.id)).next!.assigneeId).toBeNull();

    const { chore: fixed } = await ada.addChore(group.id, { title: "Dishes", recurrence: { ...weekly, assigneeId: bobId } });
    expect(fixed.assigneeId).toBeNull();
    const { next } = await ada.completeChore(group.id, fixed.id);
    expect(next!.assigneeId).toBe(bobId);

    // A fixed Assignee who leaves is dropped from the series, so later Occurrences are unassigned.
    await bob.leaveGroup(group.id, {});
    const after = await ada.completeChore(group.id, next!.id);
    expect(after.next).toMatchObject({ assigneeId: null, recurrence: { assigneeId: null } });
  });

  it("keeps only one open Occurrence, and Undo removes the one the completion created", async () => {
    const { ada, bob, group } = await setup();
    const { chore: dishes } = await ada.addChore(group.id, { title: "Dishes" });
    const { chore: bins } = await ada.addChore(group.id, { title: "Bins", dueDate: "2030-01-03", recurrence: weekly });
    const { next } = await ada.completeChore(group.id, bins.id);
    await expect(bob.completeChore(group.id, bins.id)).rejects.toMatchObject({ code: "conflict" });
    expect((await ada.getQueue(group.id)).chores.map((c) => c.id)).toEqual([dishes.id, next!.id]);

    const undone = await bob.undoCompleteChore(group.id, bins.id);
    expect(undone.chore).toEqual(bins);
    expect((await ada.getQueue(group.id)).chores).toEqual([dishes, bins]);
    expect((await ada.getDoneList(group.id)).chores).toEqual([]);

    // Completing again creates a fresh next Occurrence.
    const again = await ada.completeChore(group.id, bins.id);
    expect(again.next).toMatchObject({ dueDate: "2030-01-10" });
    expect(again.next!.id).not.toBe(next!.id);
  });

  it("refuses to Undo once the created Occurrence is done too, which would leave two open", async () => {
    const { ada, group } = await setup();
    const { chore } = await ada.addChore(group.id, { title: "Bins", recurrence: weekly });
    const { next } = await ada.completeChore(group.id, chore.id);
    await ada.completeChore(group.id, next!.id);
    await expect(ada.undoCompleteChore(group.id, chore.id)).rejects.toMatchObject({ code: "conflict", status: 409 });
    expect((await ada.getQueue(group.id)).chores).toHaveLength(1);
  });

  it("refuses to Undo after the created Occurrence was skipped, since its replacement is open", async () => {
    const { ada, group } = await setup();
    const { chore } = await ada.addChore(group.id, { title: "Bins", recurrence: weekly });
    const { next } = await ada.completeChore(group.id, chore.id);
    const skipped = await ada.deleteChore(group.id, next!.id);
    await expect(ada.undoCompleteChore(group.id, chore.id)).rejects.toMatchObject({ code: "conflict", status: 409 });
    expect((await ada.getQueue(group.id)).chores).toEqual([skipped.next]);
  });

  it("refuses to Undo once the next Occurrence was edited, keeping that edit", async () => {
    const { ada, bob, group } = await setup();
    const { chore } = await ada.addChore(group.id, { title: "Bins", recurrence: weekly });
    const { next } = await ada.completeChore(group.id, chore.id);
    const edited = await bob.updateChore(group.id, next!.id, { note: "Blue bag" });
    await expect(ada.undoCompleteChore(group.id, chore.id)).rejects.toMatchObject({
      code: "conflict",
      status: 409,
      message: "The next Occurrence was changed, so this can't be undone",
    });
    expect((await ada.getQueue(group.id)).chores).toEqual([edited.chore]);
  });

  it("refuses to Undo once the next Occurrence was assigned, but not after an empty edit", async () => {
    const { ada, bob, group, bobId } = await setup();
    const { chore } = await ada.addChore(group.id, { title: "Bins", recurrence: weekly });
    const first = await ada.completeChore(group.id, chore.id);
    await bob.updateChore(group.id, first.next!.id, {});
    await ada.undoCompleteChore(group.id, chore.id);

    const second = await ada.completeChore(group.id, chore.id);
    await ada.assignChore(group.id, second.next!.id, { assigneeId: bobId });
    await expect(ada.undoCompleteChore(group.id, chore.id)).rejects.toMatchObject({ code: "conflict", status: 409 });
    expect((await ada.getQueue(group.id)).chores).toMatchObject([{ id: second.next!.id, assigneeId: bobId }]);
  });

  it("refuses to Undo once the next Occurrence was moved", async () => {
    const { ada, bob, group } = await setup();
    const { chore: dishes } = await ada.addChore(group.id, { title: "Dishes" });
    const { chore } = await ada.addChore(group.id, { title: "Bins", recurrence: weekly });
    const { next } = await ada.completeChore(group.id, chore.id);
    await bob.moveChore(group.id, next!.id, { beforeId: dishes.id });
    await expect(ada.undoCompleteChore(group.id, chore.id)).rejects.toMatchObject({ code: "conflict", status: 409 });
    expect((await ada.getQueue(group.id)).chores.map((c) => c.id)).toEqual([next!.id, dishes.id]);
  });

  it("refuses to Undo once the next Occurrence was claimed, even if it was unclaimed again", async () => {
    const { ada, bob, group } = await setup();
    const { chore } = await ada.addChore(group.id, { title: "Bins", recurrence: weekly });
    const { next } = await ada.completeChore(group.id, chore.id);
    await bob.claimChore(group.id, next!.id);
    await expect(ada.undoCompleteChore(group.id, chore.id)).rejects.toMatchObject({ code: "conflict", status: 409 });
    await bob.unclaimChore(group.id, next!.id);
    await expect(ada.undoCompleteChore(group.id, chore.id)).rejects.toMatchObject({ code: "conflict", status: 409 });
    expect((await ada.getQueue(group.id)).chores.map((c) => c.id)).toEqual([next!.id]);
  });

  it("refuses to Undo once the next Occurrence was made a one-off with Stop repeating", async () => {
    const { ada, group } = await setup();
    const { chore } = await ada.addChore(group.id, { title: "Bins", recurrence: weekly });
    const { next } = await ada.completeChore(group.id, chore.id);
    const stopped = await ada.updateChore(group.id, next!.id, { recurrence: null });
    await expect(ada.undoCompleteChore(group.id, chore.id)).rejects.toMatchObject({ code: "conflict", status: 409 });
    expect((await ada.getQueue(group.id)).chores).toEqual([stopped.chore]);
  });

  it("still Undoes after the next Occurrence's Assignee left the Group", async () => {
    const { ada, bob, group, bobId } = await setup();
    const { chore } = await ada.addChore(group.id, { title: "Bins", recurrence: { ...weekly, assigneeId: bobId } });
    const { next } = await ada.completeChore(group.id, chore.id);
    expect(next!.assigneeId).toBe(bobId);
    await bob.leaveGroup(group.id, {});
    const undone = await ada.undoCompleteChore(group.id, chore.id);
    expect(undone.chore.id).toBe(chore.id);
    expect((await ada.getQueue(group.id)).chores.map((c) => c.id)).toEqual([chore.id]);
  });

  it("still completes when a client sends no body, as before `today` existed", async () => {
    app = await createTestApp();
    const email = "ada@example.com";
    await app.client.requestCode({ email });
    const { token } = await app.client.verifyCode({ email, code: app.lastCode(email), transport: "bearer" });
    const ada = app.clientWithToken(token);
    const { group } = await ada.createGroup({ name: "Flat 4" });
    const { chore } = await ada.addChore(group.id, { title: "Bins" });
    const res = await app.rawFetch(`/groups/${group.id}/chores/${chore.id}/complete`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    expect((await ada.getQueue(group.id)).chores).toEqual([]);
  });

  it("applies schedule edits to future Occurrences only", async () => {
    const { ada, group } = await setup();
    const { chore } = await ada.addChore(group.id, { title: "Bins", dueDate: "2030-01-03", recurrence: weekly });
    const edited = await ada.updateChore(group.id, chore.id, { recurrence: { unit: "month", every: 1, dayOfMonth: 31 } });
    expect(edited.chore).toEqual({
      ...chore,
      recurrence: { unit: "month", every: 1, dayOfMonth: 31, anchor: "calendar", assigneeId: null },
    });
    const { next } = await ada.completeChore(group.id, chore.id);
    expect(next).toMatchObject({ dueDate: "2030-01-31", recurrence: edited.chore.recurrence });
  });

  it("makes a one-off Chore recurring from the edit screen", async () => {
    const { ada, group } = await setup();
    const { chore } = await ada.addChore(group.id, { title: "Bins", dueDate: "2030-01-03" });
    expect(chore.recurrence).toBeNull();
    await ada.updateChore(group.id, chore.id, { recurrence: weekly });
    expect((await ada.completeChore(group.id, chore.id)).next).toMatchObject({ dueDate: "2030-01-10" });
  });

  it("Stop repeating leaves the current Occurrence as a one-off", async () => {
    const { ada, group } = await setup();
    const { chore } = await ada.addChore(group.id, { title: "Bins", dueDate: "2030-01-03", recurrence: weekly });
    const first = await ada.completeChore(group.id, chore.id);
    const stopped = await ada.updateChore(group.id, first.next!.id, { recurrence: null });
    expect(stopped.chore).toEqual({ ...first.next, recurrence: null });
    const done = await ada.completeChore(group.id, first.next!.id);
    expect(done.next).toBeNull();
    expect((await ada.getQueue(group.id)).chores).toEqual([]);
    expect((await ada.getDoneList(group.id)).chores.map((c) => c.recurrence)).toEqual([null, null]);
  });

  it("Delete this one skips to the next Occurrence; Delete and stop repeating ends the series", async () => {
    const { ada, group } = await setup();
    const { chore } = await ada.addChore(group.id, { title: "Bins", dueDate: "2030-01-03", recurrence: weekly });
    const skipped = await ada.deleteChore(group.id, chore.id, { today: "2030-01-01" });
    expect(skipped.next).toMatchObject({ title: "Bins", dueDate: "2030-01-10", recurrence: chore.recurrence });
    expect((await ada.getQueue(group.id)).chores).toEqual([skipped.next]);

    const stopped = await ada.deleteChore(group.id, skipped.next!.id, { stopRepeating: true });
    expect(stopped.next).toBeNull();
    expect((await ada.getQueue(group.id)).chores).toEqual([]);

    const { chore: oneOff } = await ada.addChore(group.id, { title: "Dishes" });
    expect((await ada.deleteChore(group.id, oneOff.id)).next).toBeNull();
  });

  it("rejects bad schedules and a fixed Assignee who is not a Member", async () => {
    const { ada, group } = await setup();
    const { client: carl } = await app.signedIn("carl@example.com", "Carl");
    const elsewhere = await carl.createGroup({ name: "Elsewhere" });
    const carlId = (await carl.getGroup(elsewhere.group.id)).members[0]!.id;
    const bad: unknown[] = [
      { unit: "day", every: 0 },
      { unit: "week", every: 1, weekdays: [] },
      { unit: "week", every: 1, weekdays: [0] },
      { unit: "week", every: 1 },
      { unit: "month", every: 1, dayOfMonth: 32 },
      { unit: "year", every: 1 },
      { unit: "day", every: 1, anchor: "whenever" },
    ];
    for (const recurrence of bad) {
      await expect(ada.addChore(group.id, { title: "Bins", recurrence: recurrence as RecurrenceBody })).rejects.toMatchObject({
        code: "validation_failed",
      });
    }
    await expect(ada.addChore(group.id, { title: "Bins", recurrence: { ...weekly, assigneeId: carlId } })).rejects.toMatchObject({
      code: "validation_failed",
    });
    const { chore } = await ada.addChore(group.id, { title: "Bins", recurrence: weekly });
    await expect(ada.updateChore(group.id, chore.id, { recurrence: { ...weekly, assigneeId: carlId } })).rejects.toMatchObject({
      code: "validation_failed",
    });
    await expect(ada.deleteChore(group.id, chore.id, { today: "2031-01-01" })).rejects.toMatchObject({ code: "validation_failed" });
    expect((await ada.getQueue(group.id)).chores).toEqual([chore]);
  });

  it("sorts weekdays and drops repeats", async () => {
    const { ada, group } = await setup();
    const { chore } = await ada.addChore(group.id, { title: "Bins", recurrence: { unit: "week", every: 1, weekdays: [5, 1, 5] } });
    expect(chore.recurrence).toMatchObject({ weekdays: [1, 5] });
  });
});
