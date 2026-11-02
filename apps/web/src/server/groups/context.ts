import { groupIdSchema, type AccountDto } from "@chorely/api-client";
import { requireAccount } from "../auth/request";
import type { Database } from "../db/client";
import type { Deps } from "../deps";
import { findMemberId, groupNotFound } from "./data";

/**
 * Proof that the caller is a Member of one Group. `groupId` comes from the path and has been checked
 * against the membership row, so data access keyed by it cannot cross Groups.
 */
export interface MemberContext {
  db: Database;
  /** Key material for sealing secrets we must show again (see `auth/seal.ts`). */
  authSecret: string;
  /** The server clock (fake in tests). */
  now: () => Date;
  account: AccountDto;
  memberId: string;
  groupId: string;
  withSession(res: Response): Response;
}

/** The single request-context builder for Group-scoped endpoints: session, then the Member for `groupId`. */
export async function requireMember(deps: Deps, req: Request, groupId: string): Promise<MemberContext> {
  const { account, withSession } = await requireAccount(deps, req);
  // Unknown, malformed and not-yours all look the same, so Group ids cannot be probed.
  if (!groupIdSchema.safeParse(groupId).success) throw groupNotFound();
  const memberId = await findMemberId(deps.db, groupId, account.id);
  if (!memberId) throw groupNotFound();
  return { db: deps.db, authSecret: deps.authSecret, now: deps.now, account, memberId, groupId, withSession };
}
