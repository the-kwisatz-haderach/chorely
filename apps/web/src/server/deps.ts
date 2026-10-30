import { createDb, type Database } from "./db/client";
import { fileEmail, logEmail, resendEmail, type SendEmail } from "./email";

export interface Deps {
  db: Database;
  sendEmail: SendEmail;
  now: () => Date;
  /** Key for hashing sign-in codes. */
  authSecret: string;
}

let current: Deps | undefined;

function chooseEmail(): SendEmail {
  const outbox = process.env.EMAIL_OUTBOX_DIR;
  if (outbox) {
    if (process.env.NODE_ENV === "production") throw new Error("EMAIL_OUTBOX_DIR is for tests and must not be set in production");
    return fileEmail(outbox);
  }
  const key = process.env.RESEND_API_KEY;
  if (key) return resendEmail(key, process.env.EMAIL_FROM ?? "Chorely <onboarding@resend.dev>");
  return logEmail;
}

function chooseSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") throw new Error("AUTH_SECRET is not set");
  return "dev-only-insecure-secret";
}

export function getDeps(): Deps {
  if (!current) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    current = {
      db: createDb(url).db,
      sendEmail: chooseEmail(),
      now: () => new Date(),
      authSecret: chooseSecret(),
    };
  }
  return current;
}

/** Replace the process-wide dependencies. Used by the contract-test harness. */
export function setDeps(deps: Deps | undefined) {
  current = deps;
}
