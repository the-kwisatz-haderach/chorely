import type { z } from "zod";
import type { ApiErrorBody, ErrorCode } from "@chorely/api-client";

const STATUS: Record<ErrorCode, number> = {
  internal_error: 500,
  unavailable: 503,
  not_found: 404,
  validation_failed: 400,
  unauthenticated: 401,
  invalid_code: 400,
  too_many_attempts: 429,
  rate_limited: 429,
  network_error: 500,
  invalid_response: 500,
};

export function json(body: unknown, status = 200, headers?: Record<string, string>): Response {
  return Response.json(body, { status, ...(headers ? { headers } : {}) });
}

export function errorResponse(code: ErrorCode, message: string): Response {
  const body: ApiErrorBody = { code, message };
  return json(body, STATUS[code]);
}

/** Thrown by server code to produce a shared-shape error response. */
export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
  }
}

/** Parses a JSON request body with a zod schema, throwing `validation_failed` on any mismatch. */
export async function parseBody<S extends z.ZodTypeAny>(req: Request, schema: S): Promise<z.output<S>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new AppError("validation_failed", "Request body must be JSON");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new AppError("validation_failed", "Request body did not match the expected shape");
  return parsed.data;
}

/** Turns thrown `AppError`s into responses; anything else becomes a 500 without leaking details. */
export async function handle(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof AppError) return errorResponse(err.code, err.message);
    console.error(err);
    return errorResponse("internal_error", "Something went wrong");
  }
}
