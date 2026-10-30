import { defineConfig } from "@playwright/test";

const port = 3100;
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
    env: { DATABASE_URL: databaseUrl },
  },
});
