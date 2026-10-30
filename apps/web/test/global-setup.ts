import postgres from "postgres";
import { runMigrations } from "../src/server/db/migrate";
import { adminUrl, databaseUrl, TEMPLATE_DB } from "./db-urls";

/** Builds a migrated template database once; each test clones it. */
export default async function setup() {
  const admin = postgres(adminUrl(), { max: 1, onnotice: () => {} });
  try {
    await admin.unsafe(`drop database if exists ${TEMPLATE_DB} with (force)`);
    await admin.unsafe(`create database ${TEMPLATE_DB}`);
  } finally {
    await admin.end();
  }
  await runMigrations(databaseUrl(TEMPLATE_DB));
}
