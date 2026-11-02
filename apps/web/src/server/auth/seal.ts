import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";

/** Reversible encryption (AES-256-GCM) for the few secrets we must show again. Output is `iv.tag.data`, base64url. */

function key(secret: string): Buffer {
  return createHmac("sha256", secret).update("chorely:seal:v1").digest();
}

export function seal(secret: string, plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(secret), iv);
  const data = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString("base64url")).join(".");
}

/** The plaintext, or undefined when the value is malformed or was sealed under a different secret. */
export function unseal(secret: string, sealed: string): string | undefined {
  const [iv, tag, data] = sealed.split(".").map((part) => Buffer.from(part, "base64url"));
  if (!iv || !tag || !data || iv.length !== 12 || tag.length !== 16) return undefined;
  try {
    const decipher = createDecipheriv("aes-256-gcm", key(secret), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
  } catch {
    return undefined;
  }
}
