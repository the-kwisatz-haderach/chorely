import { randomBytes } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import type { AccountDto } from "@chorely/api-client";
import type { Deps } from "../deps";
import { accounts, sessions } from "../db/schema";
import { hashToken } from "./hash";
import { toDto } from "./accounts";

export const SESSION_TTL_MS = 30 * 24 * 60 * 60_000;
/** A session is only re-extended when it has aged this much, so most requests do not write. */
const SESSION_REFRESH_AFTER_MS = 60 * 60_000;

/** Starts a session and returns the opaque token; only its hash is stored. */
export async function createSession(deps: Deps, accountId: string): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await deps.db.insert(sessions).values({
    tokenHash: hashToken(token),
    accountId,
    expiresAt: new Date(deps.now().getTime() + SESSION_TTL_MS),
  });
  return token;
}

/**
 * Resolves a session token to its Account, extending the session (30 days, rolling).
 * `refreshed` tells cookie clients to be re-issued their cookie with a fresh lifetime.
 */
export async function authenticate(
  deps: Deps,
  token: string | undefined,
): Promise<{ account: AccountDto; refreshed: boolean } | undefined> {
  if (!token) return undefined;
  const { db } = deps;
  const now = deps.now();
  const tokenHash = hashToken(token);
  const [row] = await db
    .select({ account: accounts, expiresAt: sessions.expiresAt })
    .from(sessions)
    .innerJoin(accounts, eq(accounts.id, sessions.accountId))
    .where(and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, now)));
  if (!row) return undefined;

  const refreshed = row.expiresAt.getTime() - now.getTime() < SESSION_TTL_MS - SESSION_REFRESH_AFTER_MS;
  if (refreshed) {
    await db
      .update(sessions)
      .set({ expiresAt: new Date(now.getTime() + SESSION_TTL_MS) })
      .where(eq(sessions.tokenHash, tokenHash));
  }
  return { account: toDto(row.account), refreshed };
}

export async function signOut(deps: Deps, token: string | undefined): Promise<void> {
  if (!token) return;
  await deps.db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
}
