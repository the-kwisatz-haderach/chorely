# Self-hosted auth with email one-time codes and database sessions

Accounts sign in with a 6-digit email one-time code, and nothing else in v1. We chose a self-hosted auth library (Better Auth is the leading candidate, to be verified against its docs) that stores Accounts and sessions in our own Postgres, over a managed provider (Clerk, Firebase Auth) or hand-rolled auth. A typed code beats a magic link because links open in Safari rather than the installed iOS PWA, and the same flow works in Expo later. We skipped OAuth because offering Google on iOS would force Sign in with Apple; OAuth and passkeys can be added later without changing the Account model.

Sessions are database-backed with an opaque id: an httpOnly secure cookie on web and a bearer token in secure storage on native, 30 days rolling. We rejected stateless JWTs because revocation and membership changes (leaving a Group) need a database read anyway, and every request already reads Postgres.

## Consequences

- Signing in with an unknown email creates the Account; a display name is asked once after the first sign-in.
- Codes are 6 digits, valid 10 minutes, single use, stored hashed, dead after 5 wrong attempts. Sends are rate limited per email and per IP in Postgres. Responses never reveal whether an Account exists.
- Email goes through a small `sendEmail` function (Resend to start) so the provider can be swapped.
- Invite link: one reusable link per Group, random 128-bit token stored hashed, any Member can rotate it. Opening it signs the person in (creating an Account if needed) and only then creates the Member, with the token kept through sign-in. A person already in a Group is blocked in v1.
- Members can leave but not remove each other. Leaving unassigns open Chores and keeps the Member row anonymized as "Former member"; deleting an Account does the same for all its Groups and hard-deletes the Account. A Group with no remaining Members is deleted.
- Email change is out of v1.
