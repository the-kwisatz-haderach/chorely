import type { z } from "zod";
import { ApiError, apiErrorBodySchema } from "./errors";
import { healthResponseSchema, type HealthResponse } from "./schemas";

/** The slice of `fetch` the client needs. Keeps this package free of DOM/Node types. */
export type FetchLike = (
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string },
) => Promise<{ status: number; text(): Promise<string> }>;

export interface ApiClientOptions {
  baseUrl: string;
  fetch: FetchLike;
}

export interface ApiClient {
  health(): Promise<HealthResponse>;
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

export function createApiClient({ baseUrl, fetch }: ApiClientOptions): ApiClient {
  async function request<T>(path: string, schema: z.ZodType<T>): Promise<T> {
    let res: Awaited<ReturnType<FetchLike>>;
    let text: string;
    try {
      res = await fetch(`${baseUrl}/api/v1${path}`, { headers: { accept: "application/json" } });
      text = await res.text();
    } catch (cause) {
      throw new ApiError("network_error", cause instanceof Error ? cause.message : "Network error", 0);
    }
    const body = parseJson(text);
    if (res.status < 200 || res.status >= 300) {
      const parsed = apiErrorBodySchema.safeParse(body);
      if (parsed.success) throw new ApiError(parsed.data.code, parsed.data.message, res.status);
      throw new ApiError("internal_error", `Unexpected response (HTTP ${res.status})`, res.status);
    }
    const parsed = schema.safeParse(body);
    if (!parsed.success) throw new ApiError("invalid_response", "Response did not match the expected shape", res.status);
    return parsed.data;
  }

  return { health: () => request("/health", healthResponseSchema) };
}
