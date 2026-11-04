# One image per commit: the deploy workflow builds it once for staging, then prod runs the same
# digest (ADR 0006). It serves the app and, as the migration job, applies Drizzle migrations.
FROM node:22-slim AS build
WORKDIR /repo
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile --filter "@chorely/web..."
RUN pnpm --filter @chorely/web build && pnpm --filter @chorely/web build:migrate

FROM node:22-slim
ENV NODE_ENV=production PORT=8080 HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /repo/apps/web/public ./apps/web/public
# The migration job runs `node migrate.mjs drizzle` (.github/workflows/deploy.yml).
COPY --from=build /repo/apps/web/dist/migrate.mjs ./migrate.mjs
COPY --from=build /repo/apps/web/drizzle ./drizzle
USER node
EXPOSE 8080
CMD ["node", "apps/web/server.js"]
