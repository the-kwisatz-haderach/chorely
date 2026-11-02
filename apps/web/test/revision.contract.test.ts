import { afterEach, describe, expect, it } from "vitest";
import { createTestApp, type TestApp } from "./harness";

let app: TestApp;
afterEach(async () => {
  await app.close();
});

describe("Group revision (contract, real Postgres)", () => {
  it("returns the Group counter, which every Member sees move on any Chore change", async () => {
    app = await createTestApp();
    const { client: ada } = await app.signedIn("ada@example.com", "Ada");
    const { client: bob } = await app.signedIn("bob@example.com", "Bob");
    const { group } = await ada.createGroup({ name: "Flat 4" });
    await bob.joinGroup({ token: (await ada.createInviteLink(group.id)).token });
    expect(await bob.getRevision(group.id)).toEqual({ revision: 0 });

    const { chore } = await ada.addChore(group.id, { title: "Bins" });
    await ada.claimChore(group.id, chore.id);
    expect(await bob.getRevision(group.id)).toEqual({ revision: 2 });
    expect((await bob.getQueue(group.id)).revision).toBe(2);
  });

  it("answers not_found to a non-Member and requires sign-in", async () => {
    app = await createTestApp();
    const { client: ada } = await app.signedIn("ada@example.com", "Ada");
    const { client: carl } = await app.signedIn("carl@example.com", "Carl");
    const { group } = await ada.createGroup({ name: "Flat 4" });
    await expect(carl.getRevision(group.id)).rejects.toMatchObject({ code: "not_found" });
    await expect(carl.getRevision("nope")).rejects.toMatchObject({ code: "not_found" });
    await expect(app.client.getRevision(group.id)).rejects.toMatchObject({ code: "unauthenticated" });
  });
});
