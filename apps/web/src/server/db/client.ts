import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

/** The one place Postgres connections are configured. */
export function connect(url: string, max = 5) {
  return postgres(url, { max, onnotice: () => {} });
}

export function createDb(url: string) {
  const sql = connect(url);
  return { db: drizzle(sql, { schema }), sql };
}

export type Database = ReturnType<typeof createDb>["db"];
