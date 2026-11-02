import { randomInt } from "node:crypto";
import { and, desc, eq, gt, isNull, lt, sql } from "drizzle-orm";
import type { Deps } from "../deps";
import { loginCodes, rateLimits, sessions } from "../db/schema";
import { newId } from "../ids";
import { AppError } from "../http";
import { hashCode, safeEqual } from "./hash";
import { hit } from "./rate-limit";

export const CODE_TTL_MS = 10 * 60_000;
export const MAX_CODE_ATTEMPTS = 5;

const EMAIL_LIMIT = { max: 3, windowMs: 10 * 60_000 };
const IP_LIMIT = { max: 20, windowMs: 60 * 60_000 };
/** Verify attempts per email across all of its codes, so re-requesting a code cannot reset the guess budget. */
const VERIFY_LIMIT = { max: 10, windowMs: 10 * 60_000 };
/** Rate-limit rows older than the longest window are dead weight. */
const RATE_LIMIT_RETENTION_MS = IP_LIMIT.windowMs;

function tooManyAttempts() {
  return new AppError("too_many_attempts", "Too many wrong attempts. Request a new code.");
}

/** Expired codes, sessions and rate-limit rows are removed as a side effect of sending a code. */
async function deleteExpired({ db }: Deps, now: Date) {
  await db.delete(loginCodes).where(lt(loginCodes.expiresAt, now));
  await db.delete(sessions).where(lt(sessions.expiresAt, now));
  await db.delete(rateLimits).where(lt(rateLimits.windowStart, new Date(now.getTime() - RATE_LIMIT_RETENTION_MS)));
}

/**
 * Emails a sign-in code. The outcome is identical whether or not an Account exists, and the limits
 * count every request so they reveal nothing either.
 */
export async function requestCode(deps: Deps, email: string, ip: string): Promise<void> {
  const { db } = deps;
  const now = deps.now();
  await deleteExpired(deps, now);

  const byEmail = await hit(db, `code:email:${email}`, EMAIL_LIMIT.windowMs, now);
  const byIp = await hit(db, `code:ip:${ip}`, IP_LIMIT.windowMs, now);
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
    text: `Your Chorely sign-in code is ${code}. It expires in ${CODE_TTL_MS / 60_000} minutes.`,
  });
}

/** Checks a code and consumes it. Throws unless it is right, unexpired, unused and not locked out. */
export async function consumeCode(deps: Deps, email: string, code: string): Promise<void> {
  const { db } = deps;
  const now = deps.now();
  const invalid = new AppError("invalid_code", "That code is wrong or has expired.");
  if ((await hit(db, `verify:email:${email}`, VERIFY_LIMIT.windowMs, now)) > VERIFY_LIMIT.max) throw tooManyAttempts();

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
}
