import { runMigrations } from "../src/server/db/migrate";
import { withAdmin } from "./db-admin";
import { databaseUrl, TEMPLATE_DB } from "./db-urls";

/** Builds a migrated template database once; each test clones it. */
export default async function setup() {
  await withAdmin(async (admin) => {
    await admin.unsafe(`drop database if exists ${TEMPLATE_DB} with (force)`);
    await admin.unsafe(`create database ${TEMPLATE_DB}`);
  });
  await runMigrations(databaseUrl(TEMPLATE_DB));
}
