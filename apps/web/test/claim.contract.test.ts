import { afterEach, describe, expect, it } from "vitest";
import { createTestApp, type TestApp } from "./harness";

let app: TestApp;
afterEach(async () => {
  await app.close();
});

/** A Group with Ada and Bob as Members and one unassigned Chore. */
async function setup() {
  app = await createTestApp();
  const { client: ada } = await app.signedIn("ada@example.com", "Ada");
  const { client: bob } = await app.signedIn("bob@example.com", "Bob");
  const { group } = await ada.createGroup({ name: "Flat 4" });
  await bob.joinGroup({ token: (await ada.createInviteLink(group.id)).token });
  const { members } = await ada.getGroup(group.id);
  const idOf = (name: string) => members.find((m) => m.displayName === name)!.id;
  const { chore } = await ada.addChore(group.id, { title: "Bins" });
  return { ada, bob, group, chore, adaId: idOf("Ada"), bobId: idOf("Bob") };
}

describe("Assignee and Claim (contract, real Postgres)", () => {
  it("lets a Member claim an unassigned Chore and bumps the revision", async () => {
    const { bob, group, chore, bobId } = await setup();
    const res = await bob.claimChore(group.id, chore.id);
    expect(res.chore).toEqual({ ...chore, assigneeId: bobId });
    expect(res.revision).toBe(2);
    expect((await bob.getQueue(group.id)).chores[0]?.assigneeId).toBe(bobId);
  });

  it("answers 409 when someone else already holds the Chore, leaving it and the revision alone", async () => {
    const { ada, bob, group, chore, adaId } = await setup();
    await ada.claimChore(group.id, chore.id);
    await expect(bob.claimChore(group.id, chore.id)).rejects.toMatchObject({ code: "conflict", status: 409 });
    const queue = await bob.getQueue(group.id);
    expect(queue.chores[0]?.assigneeId).toBe(adaId);
    expect(queue.revision).toBe(2);
  });

  it("lets exactly one of two simultaneous Claims win", async () => {
    const { ada, bob, group, chore } = await setup();
    const results = await Promise.allSettled([ada.claimChore(group.id, chore.id), bob.claimChore(group.id, chore.id)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const lost = results.find((r) => r.status === "rejected");
    expect(lost).toMatchObject({ reason: { code: "conflict", status: 409 } });
  });

  it("treats claiming a Chore you already hold as a no-op success", async () => {
    const { ada, group, chore, adaId } = await setup();
    await ada.claimChore(group.id, chore.id);
    const again = await ada.claimChore(group.id, chore.id);
    expect(again.chore.assigneeId).toBe(adaId);
  });

  it("lets the holder unclaim, and only the holder", async () => {
    const { ada, bob, group, chore } = await setup();
    await ada.claimChore(group.id, chore.id);
    await expect(bob.unclaimChore(group.id, chore.id)).rejects.toMatchObject({ code: "conflict", status: 409 });
    const res = await ada.unclaimChore(group.id, chore.id);
    expect(res.chore.assigneeId).toBeNull();
    await expect(ada.unclaimChore(group.id, chore.id)).rejects.toMatchObject({ code: "conflict" });
  });

  it("assigns, reassigns and unassigns a Chore to any Member", async () => {
    const { ada, group, chore, adaId, bobId } = await setup();
    expect((await ada.assignChore(group.id, chore.id, { assigneeId: bobId })).chore.assigneeId).toBe(bobId);
    expect((await ada.assignChore(group.id, chore.id, { assigneeId: adaId })).chore.assigneeId).toBe(adaId);
    const res = await ada.assignChore(group.id, chore.id, { assigneeId: null });
    expect(res.chore.assigneeId).toBeNull();
    expect(res.revision).toBe(4);
  });

  it("only assigns to a Member of the Group", async () => {
    const { ada, group, chore } = await setup();
    const { client: carl } = await app.signedIn("carl@example.com", "Carl");
    const elsewhere = await carl.createGroup({ name: "Elsewhere" });
    const carlId = (await carl.getGroup(elsewhere.group.id)).members[0]!.id;
    await expect(ada.assignChore(group.id, chore.id, { assigneeId: carlId })).rejects.toMatchObject({ code: "validation_failed" });
    await expect(ada.assignChore(group.id, chore.id, { assigneeId: "nope" })).rejects.toMatchObject({ code: "validation_failed" });
    expect((await ada.getQueue(group.id)).revision).toBe(1);
  });

  it("shows Chores held by a Member who has left as unassigned, and lets anyone claim them", async () => {
    const { ada, bob, group, chore, bobId } = await setup();
    await bob.claimChore(group.id, chore.id);
    await app.removeMember(bobId);
    expect((await ada.getQueue(group.id)).chores[0]?.assigneeId).toBeNull();
    const res = await ada.claimChore(group.id, chore.id);
    expect(res.chore.assigneeId).not.toBeNull();
  });

  it("answers not_found for unknown Chores and for Chores of another Group", async () => {
    const { ada, bob, group, chore } = await setup();
    const { client: carl } = await app.signedIn("carl@example.com", "Carl");
    const elsewhere = await carl.createGroup({ name: "Elsewhere" });
    const unknown = "00000000-0000-4000-8000-000000000000";
    await expect(ada.claimChore(group.id, unknown)).rejects.toMatchObject({ code: "not_found" });
    await expect(ada.claimChore(group.id, "nope")).rejects.toMatchObject({ code: "not_found" });
    await expect(carl.claimChore(elsewhere.group.id, chore.id)).rejects.toMatchObject({ code: "not_found" });
    await expect(carl.claimChore(group.id, chore.id)).rejects.toMatchObject({ code: "not_found" });
    await expect(bob.unclaimChore(elsewhere.group.id, chore.id)).rejects.toMatchObject({ code: "not_found" });
  });

  it("requires sign-in", async () => {
    const { group, chore } = await setup();
    await expect(app.client.claimChore(group.id, chore.id)).rejects.toMatchObject({ code: "unauthenticated" });
    await expect(app.client.assignChore(group.id, chore.id, { assigneeId: null })).rejects.toMatchObject({ code: "unauthenticated" });
  });
});
