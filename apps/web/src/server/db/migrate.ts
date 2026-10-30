import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { connect } from "./client";

export const MIGRATIONS_FOLDER = new URL("../../../drizzle", import.meta.url).pathname;

export async function runMigrations(url: string) {
  const sql = connect(url, 1);
  try {
    await migrate(drizzle(sql), { migrationsFolder: MIGRATIONS_FOLDER });
  } finally {
    await sql.end();
  }
}
