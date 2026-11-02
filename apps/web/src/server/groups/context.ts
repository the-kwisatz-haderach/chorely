import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { AccountDto } from "@chorely/api-client";
import { requireAccount } from "../auth/request";
import type { Database } from "../db/client";
import { members } from "../db/schema";
import type { Deps } from "../deps";
import { AppError } from "../http";

/**
 * Proof that the caller is a Member of one Group. `groupId` comes from the path and has been checked
 * against the membership row, so data access keyed by it cannot cross Groups.
 */
export interface MemberContext {
  db: Database;
  account: AccountDto;
  memberId: string;
  groupId: string;
  withSession(res: Response): Response;
}

/** The single request-context builder for Group-scoped endpoints: session, then the Member for `groupId`. */
export async function requireMember(deps: Deps, req: Request, groupId: string): Promise<MemberContext> {
  const { account, withSession } = await requireAccount(deps, req);
  // Unknown, malformed and not-yours all look the same, so Group ids cannot be probed.
  const notFound = new AppError("not_found", "Group not found");
  if (!z.string().uuid().safeParse(groupId).success) throw notFound;
  const [member] = await deps.db
    .select({ id: members.id })
    .from(members)
    .where(and(eq(members.groupId, groupId), eq(members.accountId, account.id)));
  if (!member) throw notFound;
  return { db: deps.db, account, memberId: member.id, groupId, withSession };
}
