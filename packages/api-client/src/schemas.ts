import { z } from "zod";

export const healthResponseSchema = z.object({ status: z.literal("ok") });
export type HealthResponse = z.infer<typeof healthResponseSchema>;

export const accountSchema = z.object({
  id: z.string(),
  email: z.string(),
  /** Null until the person has chosen one after their first sign-in. */
  displayName: z.string().nullable(),
});
export type AccountDto = z.infer<typeof accountSchema>;

export const okResponseSchema = z.object({ status: z.literal("ok") });
export type OkResponse = z.infer<typeof okResponseSchema>;

const emailSchema = z.string().trim().toLowerCase().email().max(254);

export const requestCodeBodySchema = z.object({ email: emailSchema });
export type RequestCodeBody = z.input<typeof requestCodeBodySchema>;

export const verifyCodeBodySchema = z.object({
  email: emailSchema,
  code: z.string().regex(/^\d{6}$/),
  /** `cookie` sets an httpOnly session cookie (web); `bearer` returns a token in the body (native). */
  transport: z.enum(["cookie", "bearer"]).default("cookie"),
});
export type VerifyCodeBody = z.input<typeof verifyCodeBodySchema>;

export const verifyCodeResponseSchema = z.object({
  account: accountSchema,
  /** Only present for the `bearer` transport. */
  token: z.string().optional(),
});
export type VerifyCodeResponse = z.infer<typeof verifyCodeResponseSchema>;

export const meResponseSchema = z.object({ account: accountSchema });
export type MeResponse = z.infer<typeof meResponseSchema>;

export const setDisplayNameBodySchema = z.object({ displayName: z.string().trim().min(1).max(50) });
export type SetDisplayNameBody = z.input<typeof setDisplayNameBodySchema>;
