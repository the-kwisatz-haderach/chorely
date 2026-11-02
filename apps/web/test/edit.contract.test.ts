import { afterEach, describe, expect, it } from "vitest";
import { createTestApp, type TestApp } from "./harness";

let app: TestApp;
afterEach(async () => {
  await app.close();
});

async function signedIn(email: string, displayName: string) {
  await app.client.requestCode({ email });
  const { token } = await app.client.verifyCode({ email, code: app.lastCode(email), transport: "bearer" });
  const client = app.clientWithToken(token);
  await client.setDisplayName({ displayName });
  return client;
}

/** A Group with Ada and Bob as Members. */
async function setup() {
  app = await createTestApp();
  const ada = await signedIn("ada@example.com", "Ada");
  const bob = await signedIn("bob@example.com", "Bob");
  const { group } = await ada.createGroup({ name: "Flat 4" });
  await bob.joinGroup({ token: (await ada.createInviteLink(group.id)).token });
  const { members } = await ada.getGroup(group.id);
  const idOf = (name: string) => members.find((m) => m.displayName === name)!.id;
  return { ada, bob, group, adaId: idOf("Ada"), bobId: idOf("Bob") };
}

const unknown = "00000000-0000-4000-8000-000000000000";

describe("Edit and delete a Chore (contract, real Postgres)", () => {
  it("lets any Member change every field", async () => {
    const { ada, bob, group, bobId } = await setup();
    const { chore } = await ada.addChore(group.id, { title: "Bins" });
    const res = await bob.updateChore(group.id, chore.id, {
      title: " Bins and recycling ",
      note: "Blue bag too",
      dueDate: "2030-05-06",
      assigneeId: bobId,
    });
    expect(res.chore).toEqual({
      id: chore.id,
      title: "Bins and recycling",
      note: "Blue bag too",
      dueDate: "2030-05-06",
      assigneeId: bobId,
      position: chore.position,
    });
    expect(res.revision).toBe(2);
    expect((await ada.getQueue(group.id)).chores).toEqual([res.chore]);
  });

  it("leaves omitted fields alone and clears Due date and Assignee with null", async () => {
    const { ada, group, adaId } = await setup();
    const { chore } = await ada.addChore(group.id, { title: "Bins", note: "Green", dueDate: "2030-01-01", assigneeId: adaId });
    const renamed = await ada.updateChore(group.id, chore.id, { title: "Rubbish" });
    expect(renamed.chore).toEqual({ ...chore, title: "Rubbish" });
    const cleared = await ada.updateChore(group.id, chore.id, { dueDate: null, assigneeId: null });
    expect(cleared.chore).toEqual({ ...chore, title: "Rubbish", dueDate: null, assigneeId: null });
  });

  it("never moves the Chore when its Due date changes", async () => {
    const { ada, group } = await setup();
    const { chore: a } = await ada.addChore(group.id, { title: "A", dueDate: "2030-01-01" });
    const { chore: b } = await ada.addChore(group.id, { title: "B", dueDate: "2030-02-01" });
    const { chore: c } = await ada.addChore(group.id, { title: "C", dueDate: "2030-03-01" });
    const moved = await ada.updateChore(group.id, c.id, { dueDate: "2029-01-01" });
    expect(moved.chore.position).toBe(c.position);
    await ada.updateChore(group.id, a.id, { dueDate: "2031-01-01" });
    expect((await ada.getQueue(group.id)).chores.map((x) => x.id)).toEqual([a.id, b.id, c.id]);
  });

  it("rejects bad edits and a non-Member Assignee, leaving the revision alone", async () => {
    const { ada, group } = await setup();
    const carl = await signedIn("carl@example.com", "Carl");
    const elsewhere = await carl.createGroup({ name: "Elsewhere" });
    const carlId = (await carl.getGroup(elsewhere.group.id)).members[0]!.id;
    const { chore } = await ada.addChore(group.id, { title: "Bins" });
    await expect(ada.updateChore(group.id, chore.id, { title: "  " })).rejects.toMatchObject({ code: "validation_failed" });
    await expect(ada.updateChore(group.id, chore.id, { dueDate: "2030-02-31" })).rejects.toMatchObject({ code: "validation_failed" });
    await expect(ada.updateChore(group.id, chore.id, { assigneeId: carlId })).rejects.toMatchObject({ code: "validation_failed" });
    expect((await ada.getQueue(group.id)).revision).toBe(1);
  });

  it("rejects editing a completed Chore with 409", async () => {
    const { ada, group } = await setup();
    const { chore } = await ada.addChore(group.id, { title: "Bins" });
    await ada.completeChore(group.id, chore.id);
    await expect(ada.updateChore(group.id, chore.id, { title: "Nope" })).rejects.toMatchObject({ code: "conflict", status: 409 });
  });

  it("deletes an open Chore permanently and bumps the revision", async () => {
    const { ada, bob, group } = await setup();
    const { chore: bins } = await ada.addChore(group.id, { title: "Bins" });
    const { chore: dishes } = await ada.addChore(group.id, { title: "Dishes" });
    expect(await bob.deleteChore(group.id, bins.id)).toEqual({ revision: 3 });
    const queue = await ada.getQueue(group.id);
    expect(queue.chores.map((c) => c.id)).toEqual([dishes.id]);
    expect(queue.revision).toBe(3);
    await expect(ada.updateChore(group.id, bins.id, { title: "x" })).rejects.toMatchObject({ code: "not_found" });
    await expect(ada.deleteChore(group.id, bins.id)).rejects.toMatchObject({ code: "not_found" });
  });

  it("rejects deleting a completed Chore with 409 and keeps it in the Done list", async () => {
    const { ada, group } = await setup();
    const { chore } = await ada.addChore(group.id, { title: "Bins" });
    await ada.completeChore(group.id, chore.id);
    await expect(ada.deleteChore(group.id, chore.id)).rejects.toMatchObject({ code: "conflict", status: 409 });
    expect((await ada.getDoneList(group.id)).chores.map((c) => c.id)).toEqual([chore.id]);
    expect((await ada.getQueue(group.id)).revision).toBe(2);
  });

  it("answers not_found for unknown ids and other Groups, and requires sign-in", async () => {
    const { ada, group } = await setup();
    const { chore } = await ada.addChore(group.id, { title: "Bins" });
    const carl = await signedIn("carl@example.com", "Carl");
    const elsewhere = await carl.createGroup({ name: "Elsewhere" });
    await expect(ada.updateChore(group.id, unknown, { title: "x" })).rejects.toMatchObject({ code: "not_found" });
    await expect(ada.deleteChore(group.id, "nope")).rejects.toMatchObject({ code: "not_found" });
    await expect(carl.updateChore(elsewhere.group.id, chore.id, { title: "x" })).rejects.toMatchObject({ code: "not_found" });
    await expect(carl.deleteChore(elsewhere.group.id, chore.id)).rejects.toMatchObject({ code: "not_found" });
    await expect(app.client.updateChore(group.id, chore.id, { title: "x" })).rejects.toMatchObject({ code: "unauthenticated" });
    await expect(app.client.deleteChore(group.id, chore.id)).rejects.toMatchObject({ code: "unauthenticated" });
    expect((await ada.getQueue(group.id)).chores).toHaveLength(1);
  });
});
