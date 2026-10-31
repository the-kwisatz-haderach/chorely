# Self-hosted auth with email one-time codes and database sessions

Accounts sign in with a 6-digit email one-time code, and nothing else in v1. We chose self-hosted auth that stores Accounts and sessions in our own Postgres over a managed provider (Clerk, Firebase Auth). Better Auth was the leading candidate; we checked it against its docs (October 2026) and shipped a thin custom layer instead (see below). A typed code beats a magic link because links open in Safari rather than the installed iOS PWA, and the same flow works in Expo later. We skipped OAuth because offering Google on iOS would force Sign in with Apple; OAuth and passkeys can be added later without changing the Account model.

Sessions are database-backed with an opaque id: an httpOnly secure cookie on web and a bearer token in secure storage on native, 30 days rolling. We rejected stateless JWTs because revocation and membership changes (leaving a Group) need a database read anyway, and every request already reads Postgres.

## Why a thin custom layer, not Better Auth

Better Auth was the leading candidate. We checked its docs in October 2026 (a docs-only read; we did not install or test it) and built a small layer on Node crypto and our own Postgres tables instead. The layer is about 300 lines, and contract tests pin its behavior.

- Its documented rate limiter is keyed by IP. We need per-email send limits and a cap on guesses across re-requested codes, and its docs do not describe responses that hide whether an Account exists.
- We want codes stored as a keyed HMAC bound to the email, which would mean a custom hash function in its OTP storage option.
- It brings its own `user`, `session`, `account` and `verification` tables. Our Account is the only identity, and we want app-generated UUIDv7 ids, so we would be configuring around its model.

The library would save little, and the code and session tables are plain, so adopting it later is a data migration, not a redesign. Revisit when adding OAuth or passkeys, where a library earns its keep.

## Consequences

- Signing in with an unknown email creates the Account; a display name is asked once after the first sign-in.
- Codes are 6 digits, valid 10 minutes, single use, stored hashed, dead after 5 wrong attempts. Sends are rate limited per email and per IP in Postgres. Responses never reveal whether an Account exists.
- `AUTH_SECRET` keys the code hashes and is required in production. Rotating it invalidates outstanding codes only; sessions are unaffected.
- Verify attempts are also capped per email (10 per 10 minutes) across re-requested codes, so asking for a new code does not reset the guess budget.
- Per-IP limits use the address our own proxy appended to `X-Forwarded-For` (`TRUSTED_PROXY_HOPS`, default 1); a wrong value makes those limits wrong.
- Email goes through a small `sendEmail` function (Resend to start) so the provider can be swapped.
- Invite link: one reusable link per Group, random 128-bit token stored hashed, any Member can rotate it. Opening it signs the person in (creating an Account if needed) and only then creates the Member, with the token kept through sign-in. A person already in a Group is blocked in v1.
- Members can leave but not remove each other. Leaving unassigns open Chores and keeps the Member row anonymized as "Former member"; deleting an Account does the same for all its Groups and hard-deletes the Account. A Group with no remaining Members is deleted.
- Email change is out of v1.
