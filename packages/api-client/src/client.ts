import type { z } from "zod";
import { ApiError, apiErrorBodySchema } from "./errors";
import {
  healthResponseSchema,
  meResponseSchema,
  okResponseSchema,
  verifyCodeResponseSchema,
  type HealthResponse,
  type MeResponse,
  type OkResponse,
  type RequestCodeBody,
  type SetDisplayNameBody,
  type VerifyCodeBody,
  type VerifyCodeResponse,
} from "./schemas";

/** The slice of `fetch` the client needs. Keeps this package free of DOM/Node types. */
export type FetchLike = (
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string },
) => Promise<{ status: number; text(): Promise<string> }>;

export interface ApiClientOptions {
  baseUrl: string;
  fetch: FetchLike;
  /** Supplies the bearer token for native clients. Web relies on the session cookie instead. */
  getToken?: () => string | undefined;
}

export interface ApiClient {
  health(): Promise<HealthResponse>;
  requestCode(body: RequestCodeBody): Promise<OkResponse>;
  verifyCode(body: VerifyCodeBody): Promise<VerifyCodeResponse>;
  getMe(): Promise<MeResponse>;
  setDisplayName(body: SetDisplayNameBody): Promise<MeResponse>;
  signOut(): Promise<OkResponse>;
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

export function createApiClient({ baseUrl, fetch, getToken }: ApiClientOptions): ApiClient {
  async function request<T>(
    path: string,
    schema: z.ZodType<T>,
    options: { method?: string; body?: unknown } = {},
  ): Promise<T> {
    let res: Awaited<ReturnType<FetchLike>>;
    let text: string;
    try {
      const headers: Record<string, string> = { accept: "application/json" };
      const token = getToken?.();
      if (token) headers.authorization = `Bearer ${token}`;
      if (options.body !== undefined) headers["content-type"] = "application/json";
      res = await fetch(`${baseUrl}/api/v1${path}`, {
        method: options.method ?? "GET",
        headers,
        ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      });
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

  return {
    health: () => request("/health", healthResponseSchema),
    requestCode: (body) => request("/auth/request-code", okResponseSchema, { method: "POST", body }),
    verifyCode: (body) => request("/auth/verify-code", verifyCodeResponseSchema, { method: "POST", body }),
    getMe: () => request("/me", meResponseSchema),
    setDisplayName: (body) => request("/me", meResponseSchema, { method: "PATCH", body }),
    signOut: () => request("/auth/sign-out", okResponseSchema, { method: "POST", body: {} }),
  };
}
