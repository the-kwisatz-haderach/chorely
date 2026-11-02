import { connect } from "../src/server/db/client";
import { databaseUrl } from "../playwright.config";

/**
 * The journeys all sign in from the same IP against a long-lived database, and sign-in caps sends per IP
 * (20 an hour). Without a reset, repeated runs trip the cap, no email is sent and the journeys time out
 * waiting for a code. Clearing the counters keeps the production limits as they are.
 */
export default async function globalSetup() {
  const sql = connect(databaseUrl, 1);
  try {
    await sql`delete from rate_limits`;
  } finally {
    await sql.end();
  }
}
