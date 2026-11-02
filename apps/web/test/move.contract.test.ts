import { afterEach, describe, expect, it } from "vitest";
import { createTestApp, type TestApp } from "./harness";

let app: TestApp;
afterEach(async () => {
  await app.close();
});

/** A Group with Ada and Bob as Members and the Queue A, B, C, D. */
async function setup() {
  app = await createTestApp();
  const { client: ada } = await app.signedIn("ada@example.com", "Ada");
  const { client: bob } = await app.signedIn("bob@example.com", "Bob");
  const { group } = await ada.createGroup({ name: "Flat 4" });
  await bob.joinGroup({ token: (await ada.createInviteLink(group.id)).token });
  const ids: Record<string, string> = {};
  for (const title of ["A", "B", "C", "D"]) ids[title] = (await ada.addChore(group.id, { title })).chore.id;
  const order = async () => {
    const { chores } = await ada.getQueue(group.id);
    return chores.map((c) => c.title).join("");
  };
  return { ada, bob, group, ids: ids as Record<"A" | "B" | "C" | "D", string>, order };
}

const unknown = "00000000-0000-4000-8000-000000000000";

describe("Reorder the Queue (contract, real Postgres)", () => {
  it("moves a Chore between two anchors and returns its new key", async () => {
    const { ada, group, ids, order } = await setup();
    const res = await ada.moveChore(group.id, ids.D, { afterId: ids.A, beforeId: ids.B });
    expect(res.revision).toBe(5);
    expect(await order()).toBe("ADBC");
    const queue = await ada.getQueue(group.id);
    expect(queue.chores.find((c) => c.id === ids.D)).toEqual(res.chore);
    expect(queue.revision).toBe(5);
  });

  it("moves to the front with only beforeId and to the back with only afterId", async () => {
    const { ada, bob, group, ids, order } = await setup();
    await bob.moveChore(group.id, ids.C, { beforeId: ids.A });
    expect(await order()).toBe("CABD");
    await ada.moveChore(group.id, ids.C, { afterId: ids.D });
    expect(await order()).toBe("ABDC");
  });

  it("places a Chore right beside the surviving anchor, not at the end", async () => {
    const { ada, group, ids, order } = await setup();
    await ada.moveChore(group.id, ids.D, { afterId: ids.A, beforeId: unknown });
    expect(await order()).toBe("ADBC");
    await ada.moveChore(group.id, ids.A, { afterId: unknown, beforeId: ids.C });
    expect(await order()).toBe("DBAC");
  });

  it("still uses a completed anchor's retained key", async () => {
    const { ada, group, ids, order } = await setup();
    await ada.completeChore(group.id, ids.B);
    await ada.moveChore(group.id, ids.D, { afterId: ids.A, beforeId: ids.B });
    expect(await order()).toBe("ADC");
    await ada.undoCompleteChore(group.id, ids.B);
    expect(await order()).toBe("ADBC");
  });

  it("falls back to the other anchor when one was deleted", async () => {
    const { ada, group, ids, order } = await setup();
    await ada.deleteChore(group.id, ids.B);
    await ada.moveChore(group.id, ids.D, { afterId: ids.A, beforeId: ids.B });
    expect(await order()).toBe("ADC");
    await ada.deleteChore(group.id, ids.A);
    await ada.moveChore(group.id, ids.C, { afterId: ids.A, beforeId: ids.D });
    expect(await order()).toBe("CD");
  });

  it("answers 409 only when both anchors are gone, and changes nothing", async () => {
    const { ada, group, ids, order } = await setup();
    await ada.deleteChore(group.id, ids.A);
    await ada.deleteChore(group.id, ids.B);
    await expect(ada.moveChore(group.id, ids.D, { afterId: ids.A, beforeId: ids.B })).rejects.toMatchObject({
      code: "conflict",
      status: 409,
    });
    await expect(ada.moveChore(group.id, ids.C, { afterId: unknown, beforeId: unknown })).rejects.toMatchObject({
      code: "conflict",
    });
    await expect(ada.moveChore(group.id, ids.C, { afterId: ids.C })).rejects.toMatchObject({ code: "validation_failed" });
    expect(await order()).toBe("CD");
    expect((await ada.getQueue(group.id)).revision).toBe(6);
  });

  it("lands right after the first anchor when another move put the anchors out of order", async () => {
    const { ada, bob, group, ids, order } = await setup();
    // Ada drags D between A and B, but Bob has just sent A to the back.
    await bob.moveChore(group.id, ids.A, { afterId: ids.D });
    await ada.moveChore(group.id, ids.D, { afterId: ids.A, beforeId: ids.B });
    expect(await order()).toBe("BCAD");
  });

  it("moves to the very front or back even if the Queue changed meanwhile", async () => {
    const { ada, bob, group, ids, order } = await setup();
    await bob.addChore(group.id, { title: "E", placement: "front" });
    await bob.addChore(group.id, { title: "F" });
    await ada.moveChore(group.id, ids.C, { beforeId: ids.A });
    await ada.moveChore(group.id, ids.B, { afterId: ids.D });
    expect(await order()).toBe("CEADFB");
    await ada.deleteChore(group.id, ids.A);
    await ada.moveChore(group.id, ids.D, { beforeId: ids.A });
    expect(await order()).toBe("DCEFB");
  });

  it("rejects moving a completed Chore with 409 and an unknown one with not_found", async () => {
    const { ada, bob, group, ids } = await setup();
    await ada.completeChore(group.id, ids.A);
    await expect(ada.moveChore(group.id, ids.A, { afterId: ids.D })).rejects.toMatchObject({ code: "conflict", status: 409 });
    await expect(ada.moveChore(group.id, unknown, { afterId: ids.D })).rejects.toMatchObject({ code: "not_found" });
    await expect(ada.moveChore(group.id, "nope", { afterId: ids.D })).rejects.toMatchObject({ code: "not_found" });
    const { client: carl } = await app.signedIn("carl@example.com", "Carl");
    const elsewhere = await carl.createGroup({ name: "Elsewhere" });
    await expect(carl.moveChore(elsewhere.group.id, ids.B, { afterId: ids.D })).rejects.toMatchObject({ code: "not_found" });
    await expect(app.client.moveChore(group.id, ids.B, { afterId: ids.D })).rejects.toMatchObject({ code: "unauthenticated" });
    await expect(bob.moveChore(group.id, ids.B, {})).rejects.toMatchObject({ code: "validation_failed" });
  });

  it("does not use another Group's Chore as an anchor", async () => {
    const { ada, group, ids, order } = await setup();
    const { client: carl } = await app.signedIn("carl@example.com", "Carl");
    const elsewhere = await carl.createGroup({ name: "Elsewhere" });
    const { chore: theirs } = await carl.addChore(elsewhere.group.id, { title: "Theirs" });
    await expect(ada.moveChore(group.id, ids.A, { afterId: theirs.id, beforeId: theirs.id })).rejects.toMatchObject({
      code: "conflict",
    });
    expect(await order()).toBe("ABCD");
  });

  it("resolves concurrent moves of one Chore last-write-wins", async () => {
    const { ada, bob, group, ids, order } = await setup();
    const [first, second] = await Promise.all([
      ada.moveChore(group.id, ids.D, { beforeId: ids.A }),
      bob.moveChore(group.id, ids.D, { afterId: ids.B, beforeId: ids.C }),
    ]);
    const last = first.revision > second.revision ? first : second;
    const queue = await ada.getQueue(group.id);
    expect(queue.chores.find((c) => c.id === ids.D)!.position).toBe(last.chore.position);
    expect(await order()).toBe(last === first ? "DABC" : "ABDC");
    expect(queue.revision).toBe(6);
  });
});
