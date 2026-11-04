import { afterEach, describe, expect, it } from "vitest";
import { createTestApp, type TestApp } from "./harness";

let app: TestApp;
afterEach(async () => {
  await app.close();
});

/** A Group with Ada and Bob as Members. */
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

describe("Complete, Undo and the Done list (contract, real Postgres)", () => {
  it("lets any Member complete a Chore, recording who and when, and takes it out of the Queue", async () => {
    const { ada, bob, group, bobId } = await setup();
    const { chore: bins } = await ada.addChore(group.id, { title: "Bins" });
    const { chore: dishes } = await ada.addChore(group.id, { title: "Dishes" });
    app.advance(90_000);
    const res = await bob.completeChore(group.id, bins.id);
    expect(res.chore).toMatchObject({ ...bins, completedById: bobId, completedAt: app.now().toISOString() });
    expect(res.revision).toBe(3);
    const queue = await ada.getQueue(group.id);
    expect(queue.chores.map((c) => c.id)).toEqual([dishes.id]);
    expect(queue.revision).toBe(3);
  });

  it("keeps the Assignee on completion, and Undo restores the Chore to its previous place", async () => {
    const { ada, bob, group, adaId } = await setup();
    const { chore: bins } = await ada.addChore(group.id, { title: "Bins" });
    const { chore: dishes } = await ada.addChore(group.id, { title: "Dishes" });
    const { chore: floors } = await ada.addChore(group.id, { title: "Floors" });
    await ada.claimChore(group.id, dishes.id);
    const done = await bob.completeChore(group.id, dishes.id);
    expect(done.chore).toMatchObject({ assigneeId: adaId, position: dishes.position });
    expect((await ada.getQueue(group.id)).chores.map((c) => c.id)).toEqual([bins.id, floors.id]);

    const undone = await ada.undoCompleteChore(group.id, dishes.id);
    expect(undone.chore).toEqual({ ...dishes, assigneeId: adaId });
    expect(undone.revision).toBe(6);
    const queue = await ada.getQueue(group.id);
    expect(queue.chores.map((c) => c.id)).toEqual([bins.id, dishes.id, floors.id]);
    expect((await ada.getDoneList(group.id)).chores).toEqual([]);
  });

  it("answers 409 for completing a Chore twice or undoing an open one, leaving the revision alone", async () => {
    const { ada, bob, group } = await setup();
    const { chore } = await ada.addChore(group.id, { title: "Bins" });
    await expect(ada.undoCompleteChore(group.id, chore.id)).rejects.toMatchObject({ code: "conflict", status: 409 });
    await ada.completeChore(group.id, chore.id);
    await expect(bob.completeChore(group.id, chore.id)).rejects.toMatchObject({ code: "conflict", status: 409 });
    await expect(bob.claimChore(group.id, chore.id)).rejects.toMatchObject({ code: "conflict", status: 409 });
    expect((await ada.getQueue(group.id)).revision).toBe(2);
  });

  it("lets exactly one of two simultaneous completions win", async () => {
    const { ada, bob, group } = await setup();
    const { chore } = await ada.addChore(group.id, { title: "Bins" });
    const results = await Promise.allSettled([ada.completeChore(group.id, chore.id), bob.completeChore(group.id, chore.id)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  });

  it("lists completed Chores newest first, with the completer, in pages", async () => {
    const { ada, bob, group, adaId, bobId } = await setup();
    const ids: string[] = [];
    for (const title of ["One", "Two", "Three", "Four", "Five"]) {
      ids.push((await ada.addChore(group.id, { title })).chore.id);
    }
    // Complete in a scrambled order, alternating Members.
    const order = [2, 0, 4, 1, 3];
    for (const [i, n] of order.entries()) {
      app.advance(1000);
      await (i % 2 ? bob : ada).completeChore(group.id, ids[n]!);
    }

    const first = await ada.getDoneList(group.id, { limit: 2 });
    expect(first.chores.map((c) => c.id)).toEqual([ids[3], ids[1]]);
    expect(first.chores.map((c) => c.completedById)).toEqual([adaId, bobId]);
    expect(first.nextCursor).not.toBeNull();
    const second = await ada.getDoneList(group.id, { limit: 2, cursor: first.nextCursor! });
    expect(second.chores.map((c) => c.id)).toEqual([ids[4], ids[0]]);
    expect(second.chores.map((c) => c.completedById)).toEqual([adaId, bobId]);
    const third = await ada.getDoneList(group.id, { limit: 2, cursor: second.nextCursor! });
    expect(third.chores.map((c) => c.id)).toEqual([ids[2]]);
    expect(third.nextCursor).toBeNull();
    expect((await ada.getDoneList(group.id)).chores).toHaveLength(5);
  });

  it("keeps pages stable when a Chore is completed between fetches", async () => {
    const { ada, group } = await setup();
    const ids: string[] = [];
    for (const title of ["A", "B", "C"]) ids.push((await ada.addChore(group.id, { title })).chore.id);
    await ada.completeChore(group.id, ids[0]!);
    app.advance(1000);
    await ada.completeChore(group.id, ids[1]!);
    const first = await ada.getDoneList(group.id, { limit: 1 });
    app.advance(1000);
    await ada.completeChore(group.id, ids[2]!);
    const second = await ada.getDoneList(group.id, { limit: 1, cursor: first.nextCursor! });
    expect(first.chores[0]!.id).toBe(ids[1]);
    expect(second.chores[0]!.id).toBe(ids[0]);
  });

  it("shows a completer who has left as a Former member (completedById null)", async () => {
    const { ada, bob, group } = await setup();
    const { chore } = await ada.addChore(group.id, { title: "Bins" });
    await bob.completeChore(group.id, chore.id);
    await bob.leaveGroup(group.id, {});
    const { chores } = await ada.getDoneList(group.id);
    expect(chores[0]).toMatchObject({ id: chore.id, completedById: null });
    expect(chores[0]!.completedAt).toBeTruthy();
  });

  it("places a new dated Chore among open Chores only, ignoring completed ones", async () => {
    const { ada, group } = await setup();
    const { chore: early } = await ada.addChore(group.id, { title: "Early", dueDate: "2030-01-01" });
    const { chore: late } = await ada.addChore(group.id, { title: "Late", dueDate: "2030-03-01" });
    await ada.completeChore(group.id, late.id);
    const { chore: mid } = await ada.addChore(group.id, { title: "Mid", dueDate: "2030-02-01" });
    expect((await ada.getQueue(group.id)).chores.map((c) => c.id)).toEqual([early.id, mid.id]);
  });

  it("rejects bad Done list queries", async () => {
    const { ada, group } = await setup();
    await expect(ada.getDoneList(group.id, { cursor: "nope" })).rejects.toMatchObject({ code: "validation_failed" });
    await expect(ada.getDoneList(group.id, { limit: 500 })).rejects.toMatchObject({ code: "validation_failed" });
  });

  it("answers not_found across Groups, and requires sign-in", async () => {
    const { ada, group } = await setup();
    const { chore } = await ada.addChore(group.id, { title: "Bins" });
    const { client: carl } = await app.signedIn("carl@example.com", "Carl");
    const elsewhere = await carl.createGroup({ name: "Elsewhere" });
    const unknown = "00000000-0000-4000-8000-000000000000";
    await expect(ada.completeChore(group.id, unknown)).rejects.toMatchObject({ code: "not_found" });
    await expect(ada.undoCompleteChore(group.id, "nope")).rejects.toMatchObject({ code: "not_found" });
    await expect(carl.completeChore(elsewhere.group.id, chore.id)).rejects.toMatchObject({ code: "not_found" });
    await expect(carl.getDoneList(group.id)).rejects.toMatchObject({ code: "not_found" });
    await expect(app.client.completeChore(group.id, chore.id)).rejects.toMatchObject({ code: "unauthenticated" });
    await expect(app.client.getDoneList(group.id)).rejects.toMatchObject({ code: "unauthenticated" });
  });
});
