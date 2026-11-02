import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/** Keyed hash of a sign-in code, bound to the email so a leaked hash cannot be replayed for another. */
export function hashCode(secret: string, email: string, code: string): string {
  return createHmac("sha256", secret).update(`${email}:${code}`).digest("hex");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
