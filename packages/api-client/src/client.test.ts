import { describe, expect, it } from "vitest";
import { ApiError, createApiClient, type FetchLike } from "./index";

const respond =
  (status: number, body: string): FetchLike =>
  async () => ({ status, text: async () => body });

describe("api client error mapping", () => {
  it("returns the health payload on success", async () => {
    const client = createApiClient({
      baseUrl: "http://x",
      fetch: respond(200, JSON.stringify({ status: "ok" })),
    });
    expect(await client.health()).toEqual({ status: "ok" });
  });

  it("throws ApiError with the server's code and message on a shared-shape error", async () => {
    const client = createApiClient({
      baseUrl: "http://x",
      fetch: respond(503, JSON.stringify({ code: "unavailable", message: "db down" })),
    });
    await expect(client.health()).rejects.toMatchObject({
      name: "ApiError",
      code: "unavailable",
      message: "db down",
      status: 503,
    });
  });

  it("maps a non-JSON error body (e.g. proxy 502) to internal_error", async () => {
    const client = createApiClient({ baseUrl: "http://x", fetch: respond(502, "<html>Bad gateway</html>") });
    const err = await client.health().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ code: "internal_error", status: 502 });
  });

  it("maps a network failure to network_error", async () => {
    const client = createApiClient({
      baseUrl: "http://x",
      fetch: async () => {
        throw new Error("ECONNREFUSED");
      },
    });
    await expect(client.health()).rejects.toMatchObject({ code: "network_error", status: 0 });
  });

  it("maps a 200 with an unexpected body to invalid_response", async () => {
    const client = createApiClient({ baseUrl: "http://x", fetch: respond(200, JSON.stringify({ nope: 1 })) });
    await expect(client.health()).rejects.toMatchObject({ code: "invalid_response" });
  });
});
