import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig } from "@playwright/test";

const port = 3100;
/** The dev email transport writes sent emails here so the journey can read its sign-in code. */
export const EMAIL_OUTBOX_DIR = join(tmpdir(), "chorely-e2e-outbox");
const databaseUrl = process.env.DATABASE_URL ?? "postgres://chorely:chorely@localhost:5433/chorely";

export default defineConfig({
  testDir: "./e2e",
  use: { baseURL: `http://localhost:${port}` },
  webServer: {
    // CI builds first; locally the dev server is fine.
    command: process.env.CI ? `pnpm build && pnpm start -p ${port}` : `pnpm dev -p ${port}`,
    url: `http://localhost:${port}/api/v1/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: { DATABASE_URL: databaseUrl, EMAIL_OUTBOX_DIR, AUTH_SECRET: "e2e-secret" },
  },
});
