import { afterEach, describe, expect, it } from "vitest";
import { ApiError } from "@chorely/api-client";
import { createTestApp, type TestApp } from "./harness";

let app: TestApp;
afterEach(async () => {
  await app.close();
});

describe("GET /api/v1/health (contract, real Postgres)", () => {
  it("is reachable through the typed api client", async () => {
    app = await createTestApp();
    expect(await app.client.health()).toEqual({ status: "ok" });
  });

  it("returns the shared { code, message } error with a stable code when the database is down", async () => {
    app = await createTestApp();
    await app.breakDatabase();
    const err = await app.client.health().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ code: "unavailable", status: 503 });
  });

  it("isolates each test in its own database", async () => {
    app = await createTestApp();
    const other = await createTestApp();
    try {
      await app.insertAccount("a@example.com");
      expect(await app.countAccounts()).toBe(1);
      expect(await other.countAccounts()).toBe(0);
    } finally {
      await other.close();
    }
  });
});
