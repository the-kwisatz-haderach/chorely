import { createDb, type Database } from "./db/client";
import { allowlistEmail, fileEmail, logEmail, resendEmail, type SendEmail } from "./email";

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
    // The e2e suite runs the production build, so it opts in with CHORELY_E2E.
    if (process.env.NODE_ENV === "production" && !process.env.CHORELY_E2E) {
      throw new Error("EMAIL_OUTBOX_DIR is for tests and must not be set in production");
    }
    return fileEmail(outbox);
  }
  // Trimmed because a stray newline in the secret makes fetch reject the Authorization header.
  const key = process.env.RESEND_API_KEY?.trim();
  const send = key ? resendEmail(key, process.env.EMAIL_FROM ?? "Chorely <onboarding@resend.dev>") : logEmail;
  // Comma-separated; set on staging (infra/modules/environment) so it only emails testers.
  const allowlist = process.env.EMAIL_ALLOWLIST;
  return allowlist ? allowlistEmail(allowlist.split(","), send) : send;
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
