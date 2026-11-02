import { randomBytes } from "node:crypto";
import { sql } from "drizzle-orm";
import { hashToken } from "../auth/hash";
import { inviteLinks } from "../db/schema";
import type { MemberContext } from "./context";

/** Member-scoped Invite link operations; joining is Account-keyed and lives in `data.ts`. */

/** Creates the Group's Invite link or replaces it, which stops the old one. Returns the only copy of the token. */
export async function replaceInviteLink(ctx: MemberContext): Promise<string> {
  const token = randomBytes(16).toString("base64url");
  const tokenHash = hashToken(token);
  await ctx.db
    .insert(inviteLinks)
    .values({ groupId: ctx.groupId, tokenHash })
    .onConflictDoUpdate({ target: inviteLinks.groupId, set: { tokenHash, createdAt: sql`now()` } });
  return token;
}
