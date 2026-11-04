## Getting started

Requires Node 22+, pnpm (via Corepack) and Docker.

```sh
pnpm install
cp .env.example .env     # local DATABASE_URL (Postgres on port 5433)
pnpm db:up               # start Postgres in Docker
pnpm db:migrate          # apply checked-in SQL migrations
pnpm dev                 # http://localhost:3000, health at /api/v1/health
```

| Command            | What it does                                                                                                                                       |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm typecheck`   | Typecheck every workspace package                                                                                                                  |
| `pnpm lint`        | ESLint (incl. `packages/*` purity and no JSX `style`), Stylelint (no raw colours, ADR 0005), then Prettier on Markdown (`prettier --write` to fix) |
| `pnpm test`        | Unit, lint-rule and API contract tests (needs `pnpm db:up`; each test gets its own database)                                                       |
| `pnpm test:e2e`    | Playwright smoke test (first run: `pnpm --filter @chorely/web exec playwright install chromium`)                                                   |
| `pnpm db:generate` | Generate a new SQL migration after editing `apps/web/src/server/db/schema.ts`                                                                      |
| `pnpm db:down`     | Stop Postgres                                                                                                                                      |

## Layout

- `apps/web`: Next.js app and the `/api/v1` route handlers. Server-only code lives in `src/server`; design tokens, base styles and UI primitives in `src/ui` (ADR 0005).
- `packages/api-client`: zod schemas, error codes and the typed fetch client (ADR 0004).
- `packages/domain`: pure TypeScript domain logic, no I/O.
- `tooling`: tests for repo tooling (the purity and styling lint rules).
- `infra`: Terraform for GCP (Cloud Run, Cloud SQL), applied by hand. See `infra/README.md` and ADR 0006.
