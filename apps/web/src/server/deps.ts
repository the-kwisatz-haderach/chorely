import { createDb, type Database } from "./db/client";
import { logEmail, type SendEmail } from "./email";

export interface Deps {
  db: Database;
  sendEmail: SendEmail;
}

let current: Deps | undefined;

export function getDeps(): Deps {
  if (!current) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    current = { db: createDb(url).db, sendEmail: logEmail };
  }
  return current;
}

/** Replace the process-wide dependencies. Used by the contract-test harness. */
export function setDeps(deps: Deps | undefined) {
  current = deps;
}
