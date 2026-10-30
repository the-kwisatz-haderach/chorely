import { afterEach, describe, expect, it } from "vitest";
import { createTestApp, type TestApp } from "./harness";

let app: TestApp;
afterEach(async () => {
  await app.close();
});

async function signIn(email: string) {
  await app.client.requestCode({ email });
  return app.client.verifyCode({ email, code: app.lastCode(email), transport: "bearer" });
}

describe("email-code sign-in (contract, real Postgres)", () => {
  it("emails a 6-digit code, and verifying it creates the Account and returns a working bearer session", async () => {
    app = await createTestApp();
    await app.client.requestCode({ email: "ada@example.com" });
    expect(app.lastCode("ada@example.com")).toMatch(/^\d{6}$/);

    const session = await signIn("ada@example.com");
    expect(session.account).toMatchObject({ email: "ada@example.com", displayName: null });
    expect(session.token).toEqual(expect.any(String));

    const me = await app.clientWithToken(session.token).getMe();
    expect(me.account.id).toBe(session.account.id);
    expect(await app.countAccounts()).toBe(1);
  });

  it("rejects a code once it is used, so each code works only once", async () => {
    app = await createTestApp();
    await app.client.requestCode({ email: "ada@example.com" });
    const code = app.lastCode("ada@example.com");
    await app.client.verifyCode({ email: "ada@example.com", code, transport: "bearer" });
    await expect(app.client.verifyCode({ email: "ada@example.com", code })).rejects.toMatchObject({
      code: "invalid_code",
    });
  });

  it("rejects a code after 10 minutes but accepts it just before", async () => {
    app = await createTestApp();
    await app.client.requestCode({ email: "ada@example.com" });
    app.advance(9 * 60_000 + 59_000);
    await expect(app.client.verifyCode({ email: "ada@example.com", code: app.lastCode("ada@example.com") })).resolves.toBeDefined();

    await app.client.requestCode({ email: "bob@example.com" });
    app.advance(10 * 60_000 + 1);
    await expect(app.client.verifyCode({ email: "bob@example.com", code: app.lastCode("bob@example.com") })).rejects.toMatchObject({
      code: "invalid_code",
    });
  });

  it("kills the code after 5 wrong attempts, even for the right code", async () => {
    app = await createTestApp();
    await app.client.requestCode({ email: "ada@example.com" });
    const right = app.lastCode("ada@example.com");
    const wrong = right === "000000" ? "111111" : "000000";
    for (let i = 0; i < 4; i++) {
      await expect(app.client.verifyCode({ email: "ada@example.com", code: wrong })).rejects.toMatchObject({ code: "invalid_code" });
    }
    await expect(app.client.verifyCode({ email: "ada@example.com", code: wrong })).rejects.toMatchObject({ code: "too_many_attempts", status: 429 });
    await expect(app.client.verifyCode({ email: "ada@example.com", code: right })).rejects.toMatchObject({ code: "too_many_attempts" });
  });

  it("stores only a hash of the code", async () => {
    app = await createTestApp();
    await app.client.requestCode({ email: "ada@example.com" });
    expect(await app.storedCodeHashes()).toEqual([expect.not.stringContaining(app.lastCode("ada@example.com"))]);
    expect((await app.storedCodeHashes())[0]).toMatch(/^[0-9a-f]{64}$/);
  });

  it("answers identically for known and unknown emails, and creates an Account only on sign-in", async () => {
    app = await createTestApp();
    await app.insertAccount("known@example.com");
    const known = await app.rawFetch("/auth/request-code", { method: "POST", body: { email: "known@example.com" } });
    const unknown = await app.rawFetch("/auth/request-code", { method: "POST", body: { email: "new@example.com" } });
    expect(known.status).toBe(unknown.status);
    expect(await known.json()).toEqual(await unknown.json());
    expect(await app.countAccounts()).toBe(1);

    const wrong = (email: string) => app.rawFetch("/auth/verify-code", { method: "POST", body: { email, code: "000000" } }).then((r) => r.json());
    const [a, b, c] = await Promise.all([wrong("known@example.com"), wrong("new@example.com"), wrong("never-asked@example.com")]);
    expect(a).toEqual(b);
    expect(b).toEqual(c);
  });

  it("rate limits sends per email, with a code that does not depend on the Account existing", async () => {
    app = await createTestApp();
    for (let i = 0; i < 3; i++) await app.client.requestCode({ email: "ada@example.com" });
    await expect(app.client.requestCode({ email: "ada@example.com" })).rejects.toMatchObject({ code: "rate_limited", status: 429 });
    app.advance(10 * 60_000 + 1);
    await expect(app.client.requestCode({ email: "ada@example.com" })).resolves.toBeDefined();
  });

  it("rate limits sends per IP across different emails", async () => {
    app = await createTestApp();
    const send = (i: number, ip: string) =>
      app.rawFetch("/auth/request-code", { method: "POST", headers: { "x-forwarded-for": ip }, body: { email: `u${i}@example.com` } });
    for (let i = 0; i < 20; i++) expect((await send(i, "1.2.3.4")).status).toBe(200);
    expect((await send(20, "1.2.3.4")).status).toBe(429);
    expect((await send(21, "5.6.7.8")).status).toBe(200);
  });

  it("ignores spoofed X-Forwarded-For entries, counting the address the proxy appended", async () => {
    app = await createTestApp();
    const send = (i: number) =>
      app.rawFetch("/auth/request-code", { method: "POST", headers: { "x-forwarded-for": `fake-${i}, 1.2.3.4` }, body: { email: `u${i}@example.com` } });
    for (let i = 0; i < 20; i++) expect((await send(i)).status).toBe(200);
    expect((await send(20)).status).toBe(429);
  });

  it("caps verify attempts per email across re-requested codes", async () => {
    app = await createTestApp();
    const attempt = () => app.client.verifyCode({ email: "ada@example.com", code: "000000" }).catch((e: unknown) => e);
    let last: unknown;
    for (let round = 0; round < 3; round++) {
      await app.client.requestCode({ email: "ada@example.com" });
      for (let i = 0; i < 4; i++) last = await attempt();
    }
    // 12 wrong guesses across 3 fresh codes: the budget (10) is exhausted.
    expect(last).toMatchObject({ code: "too_many_attempts" });
    await expect(app.client.verifyCode({ email: "ada@example.com", code: app.lastCode("ada@example.com") })).rejects.toMatchObject({ code: "too_many_attempts" });
    app.advance(10 * 60_000 + 1);
    await app.client.requestCode({ email: "ada@example.com" });
    await expect(app.client.verifyCode({ email: "ada@example.com", code: app.lastCode("ada@example.com") })).resolves.toBeDefined();
  });

  it("only the newest code for an email works", async () => {
    app = await createTestApp();
    await app.client.requestCode({ email: "ada@example.com" });
    const first = app.lastCode("ada@example.com");
    await app.client.requestCode({ email: "ada@example.com" });
    const second = app.lastCode("ada@example.com");
    if (first !== second) {
      await expect(app.client.verifyCode({ email: "ada@example.com", code: first })).rejects.toMatchObject({ code: "invalid_code" });
    }
    await expect(app.client.verifyCode({ email: "ada@example.com", code: second })).resolves.toBeDefined();
  });

  it("rejects malformed input with validation_failed", async () => {
    app = await createTestApp();
    await expect(app.client.requestCode({ email: "not-an-email" })).rejects.toMatchObject({ code: "validation_failed" });
    await expect(app.client.verifyCode({ email: "ada@example.com", code: "12" })).rejects.toMatchObject({ code: "validation_failed" });
  });
});

describe("sessions", () => {
  it("works as an httpOnly cookie on the web transport, and sign-out ends it", async () => {
    app = await createTestApp();
    await app.client.requestCode({ email: "ada@example.com" });
    const res = await app.rawFetch("/auth/verify-code", {
      method: "POST",
      body: { email: "ada@example.com", code: app.lastCode("ada@example.com") },
    });
    expect((await res.json()) as object).not.toHaveProperty("token");
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toMatch(/HttpOnly/);
    expect(setCookie).toMatch(/Max-Age=2592000/);
    const cookie = setCookie.split(";")[0] ?? "";

    expect((await app.rawFetch("/me", { headers: { cookie } })).status).toBe(200);
    const out = await app.rawFetch("/auth/sign-out", { method: "POST", headers: { cookie }, body: {} });
    expect(out.status).toBe(200);
    expect(out.headers.get("set-cookie")).toMatch(/Max-Age=0/);
    expect((await app.rawFetch("/me", { headers: { cookie } })).status).toBe(401);
  });

  it("re-issues the cookie with a fresh 30 days when the session rolls forward", async () => {
    app = await createTestApp();
    await app.client.requestCode({ email: "ada@example.com" });
    const res = await app.rawFetch("/auth/verify-code", {
      method: "POST",
      body: { email: "ada@example.com", code: app.lastCode("ada@example.com") },
    });
    const cookie = (res.headers.get("set-cookie") ?? "").split(";")[0] ?? "";

    expect((await app.rawFetch("/me", { headers: { cookie } })).headers.get("set-cookie")).toBeNull();
    app.advance(2 * 24 * 60 * 60_000);
    const later = await app.rawFetch("/me", { headers: { cookie } });
    expect(later.headers.get("set-cookie")).toMatch(/Max-Age=2592000/);
  });

  it("sign-out ends a bearer session", async () => {
    app = await createTestApp();
    const { token } = await signIn("ada@example.com");
    const client = app.clientWithToken(token);
    await client.signOut();
    await expect(client.getMe()).rejects.toMatchObject({ code: "unauthenticated", status: 401 });
  });

  it("rejects missing and unknown tokens", async () => {
    app = await createTestApp();
    await expect(app.client.getMe()).rejects.toMatchObject({ code: "unauthenticated" });
    await expect(app.clientWithToken("nope").getMe()).rejects.toMatchObject({ code: "unauthenticated" });
  });

  it("lasts 30 days from last use: use extends it, idleness ends it", async () => {
    app = await createTestApp();
    const { token } = await signIn("ada@example.com");
    const client = app.clientWithToken(token);
    const day = 24 * 60 * 60_000;

    app.advance(20 * day);
    await client.getMe();
    app.advance(20 * day); // 40 days after sign-in, 20 after last use
    await client.getMe();
    app.advance(30 * day + 1);
    await expect(client.getMe()).rejects.toMatchObject({ code: "unauthenticated" });
  });

  it("does not store the session token itself", async () => {
    app = await createTestApp();
    const { token } = await signIn("ada@example.com");
    expect(await app.storedSessionKeys()).toEqual([expect.not.stringContaining(token ?? "")]);
  });
});

describe("display name", () => {
  it("is null after first sign-in and can be set once signed in", async () => {
    app = await createTestApp();
    const { token } = await signIn("ada@example.com");
    const client = app.clientWithToken(token);
    expect((await client.getMe()).account.displayName).toBeNull();
    const updated = await client.setDisplayName({ displayName: "  Ada  " });
    expect(updated.account.displayName).toBe("Ada");
    expect((await client.getMe()).account.displayName).toBe("Ada");

    // Signing in again keeps the name, so it is only asked for once.
    const again = await signIn("ada@example.com");
    expect(again.account.displayName).toBe("Ada");
  });

  it("requires a session and a non-empty name", async () => {
    app = await createTestApp();
    await expect(app.client.setDisplayName({ displayName: "Ada" })).rejects.toMatchObject({ code: "unauthenticated" });
    const { token } = await signIn("ada@example.com");
    await expect(app.clientWithToken(token).setDisplayName({ displayName: "   " })).rejects.toMatchObject({ code: "validation_failed" });
  });
});

describe("cleanup", () => {
  it("removes expired codes, sessions and rate-limit rows when the next code is requested", async () => {
    app = await createTestApp();
    await signIn("ada@example.com"); // leaves a consumed code, a session, and rate-limit rows
    await app.client.requestCode({ email: "bob@example.com" });
    expect(await app.tableCounts()).toMatchObject({ loginCodes: 2, sessions: 1, rateLimits: 4 });

    app.advance(31 * 24 * 60 * 60_000);
    await app.client.requestCode({ email: "cy@example.com" });
    expect(await app.tableCounts()).toEqual({ loginCodes: 1, sessions: 0, rateLimits: 2 });
  });
});
