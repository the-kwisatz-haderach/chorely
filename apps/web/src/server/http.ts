import type { ApiErrorBody, ErrorCode } from "@chorely/api-client";

const STATUS: Record<ErrorCode, number> = {
  internal_error: 500,
  unavailable: 503,
  not_found: 404,
  validation_failed: 400,
  network_error: 500,
  invalid_response: 500,
};

export function json(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

export function errorResponse(code: ErrorCode, message: string): Response {
  const body: ApiErrorBody = { code, message };
  return json(body, STATUS[code]);
}
