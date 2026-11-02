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

describe("Leave a Group (contract, real Postgres)", () => {
  it("takes the Member out of the Group and unassigns their open Chores", async () => {
    const { ada, bob, group, adaId } = await setup();
    const { chore: bins } = await ada.addChore(group.id, { title: "Bins" });
    const { chore: dishes } = await ada.addChore(group.id, { title: "Dishes" });
    await bob.claimChore(group.id, bins.id);
    await ada.claimChore(group.id, dishes.id);
    const { revision } = await ada.getQueue(group.id);

    expect(await bob.leaveGroup(group.id, {})).toEqual({ groupDeleted: false });

    await expect(bob.getGroup(group.id)).rejects.toMatchObject({ code: "not_found", status: 404 });
    expect((await bob.listGroups()).groups).toEqual([]);
    expect((await ada.getGroup(group.id)).members.map((m) => m.displayName)).toEqual(["Ada"]);
    const queue = await ada.getQueue(group.id);
    expect(queue.chores.map((c) => [c.title, c.assigneeId])).toEqual([
      ["Bins", null],
      ["Dishes", adaId],
    ]);
    expect(queue.revision).toBeGreaterThan(revision);
  });

  it("does not let anyone assign a Chore to a Former member", async () => {
    const { ada, bob, group, bobId } = await setup();
    const { chore } = await ada.addChore(group.id, { title: "Bins" });
    await bob.leaveGroup(group.id, {});
    await expect(ada.assignChore(group.id, chore.id, { assigneeId: bobId })).rejects.toMatchObject({ code: "validation_failed" });
    await expect(ada.updateChore(group.id, chore.id, { assigneeId: bobId })).rejects.toMatchObject({ code: "validation_failed" });
    await expect(ada.addChore(group.id, { title: "Dishes", assigneeId: bobId })).rejects.toMatchObject({ code: "validation_failed" });
  });

  it("asks the last Member to confirm, and then deletes the Group with its Chores and history", async () => {
    const { ada, bob, group } = await setup();
    const { chore } = await ada.addChore(group.id, { title: "Bins" });
    await ada.completeChore(group.id, chore.id);
    await bob.leaveGroup(group.id, {});

    await expect(ada.leaveGroup(group.id, {})).rejects.toMatchObject({ code: "conflict", status: 409 });
    expect((await ada.getGroup(group.id)).members).toHaveLength(1);

    expect(await ada.leaveGroup(group.id, { deleteGroup: true })).toEqual({ groupDeleted: true });
    await expect(ada.getGroup(group.id)).rejects.toMatchObject({ code: "not_found" });
    await expect(ada.getDoneList(group.id)).rejects.toMatchObject({ code: "not_found" });
    expect((await ada.listGroups()).groups).toEqual([]);
  });

  it("deletes the Group for only one of two last Members leaving at once", async () => {
    const { ada, bob, group } = await setup();
    const results = await Promise.allSettled([ada.leaveGroup(group.id, {}), bob.leaveGroup(group.id, {})]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.find((r) => r.status === "rejected")).toMatchObject({ reason: { code: "conflict" } });
  });

  it("lets a Member who left start or join a Group again", async () => {
    const { ada, bob, group } = await setup();
    const { token } = await ada.createInviteLink(group.id);
    await bob.leaveGroup(group.id, {});
    await bob.joinGroup({ token });
    expect((await ada.getGroup(group.id)).members.map((m) => m.displayName)).toEqual(["Ada", "Bob"]);
    await ada.leaveGroup(group.id, {});
    expect((await ada.createGroup({ name: "Elsewhere" })).group.name).toBe("Elsewhere");
  });

  it("answers not_found for a Group the caller is not in, and requires sign-in", async () => {
    const { bob, group } = await setup();
    await bob.leaveGroup(group.id, {});
    await expect(bob.leaveGroup(group.id, { deleteGroup: true })).rejects.toMatchObject({ code: "not_found" });
    await expect(app.client.leaveGroup(group.id, {})).rejects.toMatchObject({ code: "unauthenticated" });
  });
});

describe("Delete an Account (contract, real Postgres)", () => {
  it("makes the person a Former member, unassigns their Chores and hard-deletes the Account", async () => {
    const { ada, bob, group } = await setup();
    const { chore: bins } = await ada.addChore(group.id, { title: "Bins" });
    const { chore: dishes } = await ada.addChore(group.id, { title: "Dishes" });
    await bob.claimChore(group.id, bins.id);
    await bob.completeChore(group.id, dishes.id);
    const accountsBefore = await app.countAccounts();

    expect(await bob.deleteAccount()).toEqual({ status: "ok" });

    expect(await app.countAccounts()).toBe(accountsBefore - 1);
    await expect(bob.getMe()).rejects.toMatchObject({ code: "unauthenticated" });
    expect((await ada.getGroup(group.id)).members.map((m) => m.displayName)).toEqual(["Ada"]);
    expect((await ada.getQueue(group.id)).chores[0]).toMatchObject({ id: bins.id, assigneeId: null });
    expect((await ada.getDoneList(group.id)).chores[0]).toMatchObject({ id: dishes.id, completedById: null });
  });

  it("deletes a Group the person was the last Member of, without asking again", async () => {
    app = await createTestApp();
    const { client: ada } = await app.signedIn("ada@example.com", "Ada");
    const { group } = await ada.createGroup({ name: "Flat 4" });
    await ada.addChore(group.id, { title: "Bins" });
    await ada.deleteAccount();

    // Signing up again with the same email is a new Account with no Group.
    const { client: again, account } = await app.signedIn("ada@example.com", "Ada");
    expect(account.displayName).toBe("Ada");
    expect((await again.listGroups()).groups).toEqual([]);
    await expect(again.getGroup(group.id)).rejects.toMatchObject({ code: "not_found" });
  });

  it("clears the web session cookie and requires sign-in", async () => {
    app = await createTestApp();
    await expect(app.client.deleteAccount()).rejects.toMatchObject({ code: "unauthenticated" });
    await app.client.requestCode({ email: "ada@example.com" });
    const verify = await app.rawFetch("/auth/verify-code", {
      method: "POST",
      body: { email: "ada@example.com", code: app.lastCode("ada@example.com") },
    });
    const cookie = verify.headers.get("set-cookie")!.split(";")[0]!;
    const res = await app.rawFetch("/me", { method: "DELETE", headers: { cookie } });
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toMatch(/chorely_session=;.*Max-Age=0/);
  });
});
