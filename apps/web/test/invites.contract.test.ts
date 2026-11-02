import { afterEach, describe, expect, it } from "vitest";
import { createTestApp, type TestApp } from "./harness";

let app: TestApp;
afterEach(async () => {
  await app.close();
});

describe("Invite links (contract, real Postgres)", () => {
  it("a Member creates an Invite link and another Account joins the Group with it", async () => {
    app = await createTestApp();
    const ada = await app.signedIn("ada@example.com", "Ada");
    const bob = await app.signedIn("bob@example.com", "Bob");
    const { group } = await ada.client.createGroup({ name: "Flat 4" });

    const { token } = await ada.client.createInviteLink(group.id);
    expect(token).toMatch(/^[A-Za-z0-9_-]{22}$/);

    const joined = await bob.client.joinGroup({ token });
    expect(joined.group).toEqual(group);

    const detail = await ada.client.getGroup(group.id);
    expect(detail.members.map((m) => m.displayName)).toEqual(["Ada", "Bob"]);
    expect((await bob.client.listGroups()).groups).toEqual([group]);
  });

  it("the link is reusable and joining again with it is harmless", async () => {
    app = await createTestApp();
    const ada = await app.signedIn("ada@example.com", "Ada");
    const bob = await app.signedIn("bob@example.com", "Bob");
    const cy = await app.signedIn("cy@example.com", "Cy");
    const { group } = await ada.client.createGroup({ name: "Flat 4" });
    const { token } = await ada.client.createInviteLink(group.id);

    await bob.client.joinGroup({ token });
    await bob.client.joinGroup({ token });
    await cy.client.joinGroup({ token });
    expect((await ada.client.getGroup(group.id)).members).toHaveLength(3);
  });

  it("any Member can replace the link, which stops the old one", async () => {
    app = await createTestApp();
    const ada = await app.signedIn("ada@example.com", "Ada");
    const bob = await app.signedIn("bob@example.com", "Bob");
    const cy = await app.signedIn("cy@example.com", "Cy");
    const { group } = await ada.client.createGroup({ name: "Flat 4" });
    const first = await ada.client.createInviteLink(group.id);
    await bob.client.joinGroup({ token: first.token });

    const second = await bob.client.createInviteLink(group.id);
    expect(second.token).not.toBe(first.token);

    await expect(cy.client.joinGroup({ token: first.token })).rejects.toMatchObject({
      code: "invalid_invite",
      status: 404,
    });
    await cy.client.joinGroup({ token: second.token });
    expect((await ada.client.getGroup(group.id)).members).toHaveLength(3);
  });

  it("an unknown or malformed link is rejected with a clear message", async () => {
    app = await createTestApp();
    const ada = await app.signedIn("ada@example.com", "Ada");
    await expect(ada.client.joinGroup({ token: "AAAAAAAAAAAAAAAAAAAAAA" })).rejects.toMatchObject({
      code: "invalid_invite",
      message: expect.stringMatching(/invite link/i),
    });
    await expect(ada.client.joinGroup({ token: "nope" })).rejects.toMatchObject({ code: "invalid_invite" });
  });

  it("a person already in a Group cannot join another, and stays in theirs", async () => {
    app = await createTestApp();
    const ada = await app.signedIn("ada@example.com", "Ada");
    const bob = await app.signedIn("bob@example.com", "Bob");
    const { group: flat } = await ada.client.createGroup({ name: "Flat 4" });
    const { group: office } = await bob.client.createGroup({ name: "Office" });
    const { token } = await ada.client.createInviteLink(flat.id);

    await expect(bob.client.joinGroup({ token })).rejects.toMatchObject({
      code: "conflict",
      status: 409,
      message: expect.stringMatching(/already in a Group/i),
    });
    expect((await bob.client.listGroups()).groups).toEqual([office]);
    expect((await ada.client.getGroup(flat.id)).members).toHaveLength(1);
  });

  it("only Members can create a link, and signed-out callers cannot join", async () => {
    app = await createTestApp();
    const ada = await app.signedIn("ada@example.com", "Ada");
    const bob = await app.signedIn("bob@example.com", "Bob");
    const { group } = await ada.client.createGroup({ name: "Flat 4" });
    const { token } = await ada.client.createInviteLink(group.id);

    await expect(bob.client.createInviteLink(group.id)).rejects.toMatchObject({ code: "not_found" });
    await expect(app.client.createInviteLink(group.id)).rejects.toMatchObject({ code: "unauthenticated" });
    await expect(app.client.joinGroup({ token })).rejects.toMatchObject({ code: "unauthenticated" });
  });

  it("stores only a hash of the token", async () => {
    app = await createTestApp();
    const ada = await app.signedIn("ada@example.com", "Ada");
    const { group } = await ada.client.createGroup({ name: "Flat 4" });
    const { token } = await ada.client.createInviteLink(group.id);
    const stored = await app.storedInviteHashes();
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatch(/^[0-9a-f]{64}$/);
    expect(stored[0]).not.toContain(token);
  });

  it("any Member can read the current link back, so it can be copied after a reload", async () => {
    app = await createTestApp();
    const ada = await app.signedIn("ada@example.com", "Ada");
    const bob = await app.signedIn("bob@example.com", "Bob");
    const { group } = await ada.client.createGroup({ name: "Flat 4" });
    expect(await ada.client.getInviteLink(group.id)).toEqual({ token: null });

    const { token } = await ada.client.createInviteLink(group.id);
    await bob.client.joinGroup({ token });
    expect(await ada.client.getInviteLink(group.id)).toEqual({ token });
    expect(await bob.client.getInviteLink(group.id)).toEqual({ token });

    const replaced = await bob.client.createInviteLink(group.id);
    expect(await ada.client.getInviteLink(group.id)).toEqual({ token: replaced.token });
  });

  it("only Members can read the link", async () => {
    app = await createTestApp();
    const ada = await app.signedIn("ada@example.com", "Ada");
    const bob = await app.signedIn("bob@example.com", "Bob");
    const { group } = await ada.client.createGroup({ name: "Flat 4" });
    await ada.client.createInviteLink(group.id);
    await expect(bob.client.getInviteLink(group.id)).rejects.toMatchObject({ code: "not_found" });
    await expect(app.client.getInviteLink(group.id)).rejects.toMatchObject({ code: "unauthenticated" });
  });

  it("keeps the readable copy encrypted, never the token in the clear", async () => {
    app = await createTestApp();
    const ada = await app.signedIn("ada@example.com", "Ada");
    const { group } = await ada.client.createGroup({ name: "Flat 4" });
    const { token } = await ada.client.createInviteLink(group.id);
    const [ciphertext] = await app.storedInviteCiphertexts();
    expect(ciphertext).toBeTruthy();
    expect(ciphertext).not.toContain(token);
  });

  it("reads back no link when the stored copy cannot be decrypted, and a replace repairs it", async () => {
    app = await createTestApp();
    const ada = await app.signedIn("ada@example.com", "Ada");
    const { group } = await ada.client.createGroup({ name: "Flat 4" });
    await ada.client.createInviteLink(group.id);
    await app.corruptInviteCiphertexts();
    expect(await ada.client.getInviteLink(group.id)).toEqual({ token: null });
    const { token } = await ada.client.createInviteLink(group.id);
    expect(await ada.client.getInviteLink(group.id)).toEqual({ token });
  });
});
