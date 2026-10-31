import { z } from "zod";

/** Stable, machine-readable error codes. Add new codes; never rename or remove (ADR 0004). */
export const ERROR_CODES = [
  "internal_error",
  "unavailable",
  "not_found",
  "validation_failed",
  "unauthenticated",
  "invalid_code",
  "too_many_attempts",
  "rate_limited",
  // Raised by the client itself, never sent by the server.
  "network_error",
  "invalid_response",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

/** The one error shape every API error response shares. */
export const apiErrorBodySchema = z.object({
  code: z.enum(ERROR_CODES),
  message: z.string(),
});

export type ApiErrorBody = z.infer<typeof apiErrorBodySchema>;

export class ApiError extends Error {
  override readonly name = "ApiError";
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
