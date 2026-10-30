import { connect } from "../src/server/db/client";
import { adminUrl } from "./db-urls";

type Admin = ReturnType<typeof connect>;

/** Runs `fn` with a short-lived connection for CREATE/DROP DATABASE. */
export async function withAdmin<T>(fn: (admin: Admin) => Promise<T>): Promise<T> {
  const admin = connect(adminUrl(), 1);
  try {
    return await fn(admin);
  } finally {
    await admin.end();
  }
}
