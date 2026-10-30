# Self-hosted auth with email one-time codes and database sessions

Accounts sign in with a 6-digit email one-time code, and nothing else in v1. We chose self-hosted auth that stores Accounts and sessions in our own Postgres over a managed provider (Clerk, Firebase Auth). Better Auth was the leading candidate; we checked it against its docs (October 2026) and shipped a thin custom layer instead (see below). A typed code beats a magic link because links open in Safari rather than the installed iOS PWA, and the same flow works in Expo later. We skipped OAuth because offering Google on iOS would force Sign in with Apple; OAuth and passkeys can be added later without changing the Account model.

Sessions are database-backed with an opaque id: an httpOnly secure cookie on web and a bearer token in secure storage on native, 30 days rolling. We rejected stateless JWTs because revocation and membership changes (leaving a Group) need a database read anyway, and every request already reads Postgres.

## Better Auth evaluation

Its email-OTP, session and Drizzle features cover much of this, but it does not fit the requirements above without us writing the same code around it:

- **Send rate limits:** its rate limiter is keyed by IP only (memory, database or secondary storage). The docs describe no per-email limit, and no limit on code sends beyond `allowedAttempts` on verification. We need both per email and per IP in Postgres, and a cap on guesses across re-requested codes.
- **Enumeration:** the docs say nothing on responses that hide whether an Account exists. We pin that with contract tests either way.
- **Code storage:** `storeOTP: "hashed"` is available, but we use a keyed HMAC bound to the email, since a bare hash of a 6-digit code is trivially reversible. This would be a custom hash function.
- **Data model:** it brings its own `user`, `session`, `account` and `verification` tables. Our Account is the only identity, so `account` (provider links) would be unused, and a nullable display name would be an `additionalFields` mapping onto its required `name`. App-generated UUIDv7 ids need a custom `generateId`.
- **Bearer:** the bearer plugin returns the session token in a `set-auth-token` header and its docs warn to use it cautiously. We return the token in the response body for an explicit `bearer` transport, and the cookie is never readable by scripts.
- **Defaults differ:** 5 minute OTP, 3 attempts and 7 day sessions, all configurable. Its docs also advise not awaiting the email send, which conflicts with surfacing send failures.

The custom layer is about 300 lines and fully covered by contract tests, so Better Auth would remove little code. Sessions and codes live in our own tables with the same semantics, so adopting it later means a data migration, not a redesign.

## Consequences

- Signing in with an unknown email creates the Account; a display name is asked once after the first sign-in.
- Codes are 6 digits, valid 10 minutes, single use, stored hashed, dead after 5 wrong attempts. Sends are rate limited per email and per IP in Postgres. Responses never reveal whether an Account exists.
- Email goes through a small `sendEmail` function (Resend to start) so the provider can be swapped.
- Invite link: one reusable link per Group, random 128-bit token stored hashed, any Member can rotate it. Opening it signs the person in (creating an Account if needed) and only then creates the Member, with the token kept through sign-in. A person already in a Group is blocked in v1.
- Members can leave but not remove each other. Leaving unassigns open Chores and keeps the Member row anonymized as "Former member"; deleting an Account does the same for all its Groups and hard-deletes the Account. A Group with no remaining Members is deleted.
- Email change is out of v1.
