import { randomBytes } from "node:crypto";
import { sql } from "drizzle-orm";
import { hashToken } from "../auth/hash";
import { eq } from "drizzle-orm";
import { seal, unseal } from "../auth/seal";
import { inviteLinks } from "../db/schema";
import type { MemberContext } from "./context";

/** Member-scoped Invite link operations; joining is Account-keyed and lives in `data.ts`. */

/** Creates the Group's Invite link or replaces it, which stops the old one. */
export async function replaceInviteLink(ctx: MemberContext): Promise<string> {
  const token = randomBytes(16).toString("base64url");
  const stored = { tokenHash: hashToken(token), tokenCiphertext: seal(ctx.authSecret, token) };
  await ctx.db
    .insert(inviteLinks)
    .values({ groupId: ctx.groupId, ...stored })
    .onConflictDoUpdate({ target: inviteLinks.groupId, set: { ...stored, createdAt: sql`now()` } });
  return token;
}

/** The current token, or null when there is no link or its stored copy no longer decrypts (replace to repair). */
export async function currentInviteToken(ctx: MemberContext): Promise<string | null> {
  const [row] = await ctx.db
    .select({ ciphertext: inviteLinks.tokenCiphertext })
    .from(inviteLinks)
    .where(eq(inviteLinks.groupId, ctx.groupId));
  return (row?.ciphertext && unseal(ctx.authSecret, row.ciphertext)) || null;
}
