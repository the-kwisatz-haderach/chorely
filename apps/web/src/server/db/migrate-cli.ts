import { runMigrations } from "./migrate";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");
// The Docker image runs this bundled (dist/migrate.mjs), so it passes the folder it copied the SQL to.
await runMigrations(url, process.argv[2]);
console.log("Migrations applied");
