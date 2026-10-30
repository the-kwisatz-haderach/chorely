# Versioned REST/JSON contract, served by one Next.js service

The API is REST/JSON under `/api/v1`, implemented as Next.js route handlers in `apps/web` and deployed as a single Cloud Run service. Request and response schemas are defined once in zod in `packages/api-client`, which also ships the typed fetch client used by the web app and, later, Expo. We chose this over tRPC and Server Actions because native clients in the stores cannot be force-updated: web and native will run different API versions for a while, so the contract must be a standalone artifact, not the server's code. Server Actions are not callable from Expo at all, and tRPC couples the client to the server's router type and has no first-class versioning. We also rejected a separate Node API service: for a solo builder on a tight budget, one deployable and same-origin cookies outweigh the independence a split would give.

## Consequences

- The web app uses the same client as Expo; it has no private shortcut to the server.
- Within `/api/v1` changes are additive only. A breaking change gets `/api/v2`, served alongside `v1` until old native builds age out.
- Errors share one shape, `{ code, message }`, with a stable machine-readable `code`. Races return explicit statuses (for example `409` on a lost Claim) and the client refetches.
- Handlers validate with the same zod schemas the client uses; keeping routes and schemas in sync is a convention, not enforced by types.
- Groups are addressed in the path (`/api/v1/groups/{groupId}/...`) even though v1 allows one Group per Member, so the contract survives multiple Groups.
- Server-only code (Drizzle, auth, fractional-key generation, transactions) lives in a folder in `apps/web`, kept out of route files, with all Group data access behind one module that requires a Member context. Auth (codes, sessions, Accounts) sits outside that rule because it runs before any Member exists, and lives in its own `server/auth` module. Extracting it into a separate service later is a move, not a rewrite.
- `packages/domain` stays pure TypeScript with no I/O.
