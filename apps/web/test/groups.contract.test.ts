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
  const { account } = await client.setDisplayName({ displayName });
  return { client, account };
}

describe("Groups (contract, real Postgres)", () => {
  it("a new account has no Group; creating one makes the creator its Member", async () => {
    app = await createTestApp();
    const ada = await signedIn("ada@example.com", "Ada");
    expect((await ada.client.listGroups()).groups).toEqual([]);

    const { group } = await ada.client.createGroup({ name: "  Flat 4  " });
    expect(group.name).toBe("Flat 4");

    expect((await ada.client.listGroups()).groups).toEqual([group]);
    const detail = await ada.client.getGroup(group.id);
    expect(detail.group).toEqual(group);
    expect(detail.members).toEqual([expect.objectContaining({ accountId: ada.account.id, displayName: "Ada" })]);
  });

  it("rejects an empty name and a second Group for the same Account", async () => {
    app = await createTestApp();
    const ada = await signedIn("ada@example.com", "Ada");
    await expect(ada.client.createGroup({ name: "   " })).rejects.toMatchObject({ code: "validation_failed" });
    await ada.client.createGroup({ name: "One" });
    await expect(ada.client.createGroup({ name: "Two" })).rejects.toMatchObject({ code: "conflict", status: 409 });
  });

  it("any Member can rename the Group", async () => {
    app = await createTestApp();
    const ada = await signedIn("ada@example.com", "Ada");
    const { group } = await ada.client.createGroup({ name: "Flat 4" });
    const renamed = await ada.client.renameGroup(group.id, { name: "Flat 5" });
    expect(renamed.group).toEqual({ id: group.id, name: "Flat 5" });
    expect((await ada.client.getGroup(group.id)).group.name).toBe("Flat 5");
    await expect(ada.client.renameGroup(group.id, { name: "" })).rejects.toMatchObject({ code: "validation_failed" });
  });

  it("rejects non-Members and signed-out callers on every Group-scoped endpoint", async () => {
    app = await createTestApp();
    const ada = await signedIn("ada@example.com", "Ada");
    const bob = await signedIn("bob@example.com", "Bob");
    const { group } = await ada.client.createGroup({ name: "Flat 4" });

    await expect(bob.client.getGroup(group.id)).rejects.toMatchObject({ code: "not_found", status: 404 });
    await expect(bob.client.renameGroup(group.id, { name: "Hijacked" })).rejects.toMatchObject({ code: "not_found" });
    await expect(bob.client.getGroup("not-a-uuid")).rejects.toMatchObject({ code: "not_found" });
    await expect(app.client.getGroup(group.id)).rejects.toMatchObject({ code: "unauthenticated" });
    await expect(app.client.listGroups()).rejects.toMatchObject({ code: "unauthenticated" });
    await expect(app.client.createGroup({ name: "x" })).rejects.toMatchObject({ code: "unauthenticated" });

    expect((await ada.client.getGroup(group.id)).group.name).toBe("Flat 4");
    expect((await bob.client.listGroups()).groups).toEqual([]);
  });
});
