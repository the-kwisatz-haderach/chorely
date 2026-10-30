import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { and, desc, eq, gt, isNull, lt, sql } from "drizzle-orm";
import type { AccountDto } from "@chorely/api-client";
import type { Deps } from "../deps";
import { accounts, loginCodes, rateLimits, sessions } from "../db/schema";
import { newId } from "../ids";
import { AppError } from "../http";
import { hit } from "./rate-limit";

export const CODE_TTL_MS = 10 * 60_000;
export const MAX_CODE_ATTEMPTS = 5;
export const SESSION_TTL_MS = 30 * 24 * 60 * 60_000;
/** A session is only re-extended when it has aged this much, so most requests do not write. */
const SESSION_REFRESH_AFTER_MS = 60 * 60_000;

const EMAIL_LIMIT = { max: 3, windowMs: 10 * 60_000 };
const IP_LIMIT = { max: 20, windowMs: 60 * 60_000 };
/** Rate-limit rows older than the longest window are dead weight. */
const RATE_LIMIT_RETENTION_MS = IP_LIMIT.windowMs;

function hashCode(secret: string, email: string, code: string): string {
  return createHmac("sha256", secret).update(`${email}:${code}`).digest("hex");
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

function toDto(row: typeof accounts.$inferSelect): AccountDto {
  return { id: row.id, email: row.email, displayName: row.displayName };
}

/** Expired codes, sessions and rate-limit rows are removed as a side effect of sending a code. */
async function cleanup({ db }: Deps, now: Date) {
  await db.delete(loginCodes).where(lt(loginCodes.expiresAt, now));
  await db.delete(sessions).where(lt(sessions.expiresAt, now));
  await db.delete(rateLimits).where(lt(rateLimits.windowStart, new Date(now.getTime() - RATE_LIMIT_RETENTION_MS)));
}

/**
 * Emails a sign-in code. The outcome is identical whether or not an Account exists, and the limits
 * count every request so they reveal nothing either.
 */
export async function requestCode(deps: Deps, email: string, ip: string): Promise<void> {
  const { db, now: clock } = deps;
  const now = clock();
  await cleanup(deps, now);

  const [byEmail, byIp] = [
    await hit(db, `code:email:${email}`, EMAIL_LIMIT.windowMs, now),
    await hit(db, `code:ip:${ip}`, IP_LIMIT.windowMs, now),
  ];
  if (byEmail > EMAIL_LIMIT.max || byIp > IP_LIMIT.max) {
    throw new AppError("rate_limited", "Too many sign-in requests. Try again later.");
  }

  const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
  await db.transaction(async (tx) => {
    await tx.delete(loginCodes).where(eq(loginCodes.email, email));
    await tx.insert(loginCodes).values({
      id: newId(),
      email,
      codeHash: hashCode(deps.authSecret, email, code),
      expiresAt: new Date(now.getTime() + CODE_TTL_MS),
    });
  });
  await deps.sendEmail({
    to: email,
    subject: "Your Chorely sign-in code",
    text: `Your Chorely sign-in code is ${code}. It expires in 10 minutes.`,
  });
}

/** Checks a code and, if right, signs the person in, creating their Account on first sign-in. */
export async function verifyCode(
  deps: Deps,
  email: string,
  code: string,
): Promise<{ account: AccountDto; token: string }> {
  const { db } = deps;
  const now = deps.now();
  const invalid = new AppError("invalid_code", "That code is wrong or has expired.");

  const [row] = await db
    .select()
    .from(loginCodes)
    .where(and(eq(loginCodes.email, email), isNull(loginCodes.consumedAt), gt(loginCodes.expiresAt, now)))
    .orderBy(desc(loginCodes.createdAt))
    .limit(1);
  if (!row) throw invalid;
  if (row.attempts >= MAX_CODE_ATTEMPTS) throw tooManyAttempts();

  if (!safeEqual(row.codeHash, hashCode(deps.authSecret, email, code))) {
    const [bumped] = await db
      .update(loginCodes)
      .set({ attempts: sql`${loginCodes.attempts} + 1` })
      .where(and(eq(loginCodes.id, row.id), isNull(loginCodes.consumedAt)))
      .returning({ attempts: loginCodes.attempts });
    if (bumped && bumped.attempts >= MAX_CODE_ATTEMPTS) throw tooManyAttempts();
    throw invalid;
  }

  // Single use: only one concurrent request can flip consumed_at.
  const [consumed] = await db
    .update(loginCodes)
    .set({ consumedAt: now })
    .where(and(eq(loginCodes.id, row.id), isNull(loginCodes.consumedAt), lt(loginCodes.attempts, MAX_CODE_ATTEMPTS)))
    .returning({ id: loginCodes.id });
  if (!consumed) throw invalid;

  await db.insert(accounts).values({ id: newId(), email }).onConflictDoNothing({ target: accounts.email });
  const [account] = await db.select().from(accounts).where(eq(accounts.email, email));
  if (!account) throw new Error("Account missing after sign-in");

  const token = randomBytes(32).toString("base64url");
  await db.insert(sessions).values({
    tokenHash: hashToken(token),
    accountId: account.id,
    expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
  });
  return { account: toDto(account), token };
}

function tooManyAttempts() {
  return new AppError("too_many_attempts", "Too many wrong attempts. Request a new code.");
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

export async function setDisplayName(deps: Deps, accountId: string, displayName: string): Promise<AccountDto> {
  const [row] = await deps.db.update(accounts).set({ displayName }).where(eq(accounts.id, accountId)).returning();
  if (!row) throw new AppError("not_found", "Account not found");
  return toDto(row);
}
