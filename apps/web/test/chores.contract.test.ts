import { afterEach, describe, expect, it } from "vitest";
import { createTestApp, type TestApp } from "./harness";

let app: TestApp;
afterEach(async () => {
  await app.close();
});

async function groupWithAda() {
  app = await createTestApp();
  const ada = await app.signedIn("ada@example.com", "Ada");
  const { group } = await ada.client.createGroup({ name: "Flat 4" });
  return { ada, group };
}

const titles = async (ada: Awaited<ReturnType<typeof groupWithAda>>["ada"], groupId: string) =>
  (await ada.client.getQueue(groupId)).chores.map((c) => c.title);

describe("Queue: add and view Chores (contract, real Postgres)", () => {
  it("a new Group has an empty Queue at revision 0", async () => {
    const { ada, group } = await groupWithAda();
    expect(await ada.client.getQueue(group.id)).toEqual({ chores: [], revision: 0 });
  });

  it("adds a Chore with title, note, Due date and Assignee", async () => {
    const { ada, group } = await groupWithAda();
    const { members } = await ada.client.getGroup(group.id);
    const memberId = members[0]!.id;
    const { chore } = await ada.client.addChore(group.id, {
      title: "  Take out bins ",
      note: "Green bin too",
      dueDate: "2030-03-04",
      assigneeId: memberId,
    });
    expect(chore).toMatchObject({ title: "Take out bins", note: "Green bin too", dueDate: "2030-03-04", assigneeId: memberId });
    expect((await ada.client.getQueue(group.id)).chores).toEqual([chore]);
  });

  it("defaults note, Due date and Assignee to empty", async () => {
    const { ada, group } = await groupWithAda();
    const { chore } = await ada.client.addChore(group.id, { title: "Dust" });
    expect(chore).toMatchObject({ note: "", dueDate: null, assigneeId: null });
  });

  it("puts undated Chores at the back by default and at the front when asked", async () => {
    const { ada, group } = await groupWithAda();
    await ada.client.addChore(group.id, { title: "A" });
    await ada.client.addChore(group.id, { title: "B" });
    await ada.client.addChore(group.id, { title: "C", placement: "front" });
    expect(await titles(ada, group.id)).toEqual(["C", "A", "B"]);
  });

  it("seeds a dated Chore before the first later Due date, skipping undated and placing ties after", async () => {
    const { ada, group } = await groupWithAda();
    await ada.client.addChore(group.id, { title: "undated" });
    await ada.client.addChore(group.id, { title: "jan20", dueDate: "2030-01-20" });
    await ada.client.addChore(group.id, { title: "jan15", dueDate: "2030-01-15" });
    await ada.client.addChore(group.id, { title: "jan15b", dueDate: "2030-01-15" });
    await ada.client.addChore(group.id, { title: "feb", dueDate: "2030-02-01" });
    expect(await titles(ada, group.id)).toEqual(["undated", "jan15", "jan15b", "jan20", "feb"]);
  });

  it("lets an explicit placement override the Due date", async () => {
    const { ada, group } = await groupWithAda();
    await ada.client.addChore(group.id, { title: "early", dueDate: "2030-01-01" });
    await ada.client.addChore(group.id, { title: "late", dueDate: "2030-12-01", placement: "front" });
    expect(await titles(ada, group.id)).toEqual(["late", "early"]);
  });

  it("orders the Queue by position using C collation", async () => {
    const { ada, group } = await groupWithAda();
    for (let i = 0; i < 30; i++) await ada.client.addChore(group.id, { title: `back${i}` });
    for (let i = 0; i < 30; i++) await ada.client.addChore(group.id, { title: `front${i}`, placement: "front" });
    const { chores } = await ada.client.getQueue(group.id);
    const positions = chores.map((c) => c.position);
    expect(positions).toEqual([...positions].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)));
    expect(chores[0]?.title).toBe("front29");
    expect(chores.at(-1)?.title).toBe("back29");
  });

  it("bumps the Group revision on every add", async () => {
    const { ada, group } = await groupWithAda();
    const first = await ada.client.addChore(group.id, { title: "A" });
    const second = await ada.client.addChore(group.id, { title: "B" });
    expect([first.revision, second.revision]).toEqual([1, 2]);
    expect((await ada.client.getQueue(group.id)).revision).toBe(2);
  });

  it("keeps positions distinct when Chores are added concurrently", async () => {
    const { ada, group } = await groupWithAda();
    await Promise.all(Array.from({ length: 8 }, (_, i) => ada.client.addChore(group.id, { title: `c${i}` })));
    const { chores, revision } = await ada.client.getQueue(group.id);
    expect(revision).toBe(8);
    expect(new Set(chores.map((c) => c.position)).size).toBe(8);
  });

  it("rejects invalid input without changing the revision", async () => {
    const { ada, group } = await groupWithAda();
    const bad = [
      { title: "   " },
      { title: "x".repeat(101) },
      { title: "ok", dueDate: "2030-02-30" },
      { title: "ok", dueDate: "tomorrow" },
      { title: "ok", placement: "middle" as "front" },
      { title: "ok", assigneeId: "not-a-uuid" },
    ];
    for (const body of bad) {
      await expect(ada.client.addChore(group.id, body)).rejects.toMatchObject({ code: "validation_failed" });
    }
    expect(await ada.client.getQueue(group.id)).toEqual({ chores: [], revision: 0 });
  });

  it("only accepts an Assignee who is a Member of the Group", async () => {
    const { ada, group } = await groupWithAda();
    const bob = await app.signedIn("bob@example.com", "Bob");
    const bobsGroup = await bob.client.createGroup({ name: "Elsewhere" });
    const bobMember = (await bob.client.getGroup(bobsGroup.group.id)).members[0]!;
    await expect(ada.client.addChore(group.id, { title: "x", assigneeId: bobMember.id })).rejects.toMatchObject({
      code: "validation_failed",
    });
    expect((await ada.client.getQueue(group.id)).revision).toBe(0);
  });

  it("keeps each Group's Queue separate and hides it from non-Members and signed-out callers", async () => {
    const { ada, group } = await groupWithAda();
    const bob = await app.signedIn("bob@example.com", "Bob");
    const bobsGroup = await bob.client.createGroup({ name: "Elsewhere" });
    await ada.client.addChore(group.id, { title: "Ada's" });

    await expect(bob.client.getQueue(group.id)).rejects.toMatchObject({ code: "not_found", status: 404 });
    await expect(bob.client.addChore(group.id, { title: "Sneaky" })).rejects.toMatchObject({ code: "not_found" });
    await expect(app.client.getQueue(group.id)).rejects.toMatchObject({ code: "unauthenticated" });
    await expect(app.client.addChore(group.id, { title: "x" })).rejects.toMatchObject({ code: "unauthenticated" });

    expect((await bob.client.getQueue(bobsGroup.group.id)).chores).toEqual([]);
    expect(await titles(ada, group.id)).toEqual(["Ada's"]);
  });
});
