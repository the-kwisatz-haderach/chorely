import { eq } from "drizzle-orm";
import type { AccountDto } from "@chorely/api-client";
import type { Database } from "../db/client";
import { accounts } from "../db/schema";
import { leaveAllGroups } from "../groups/data";
import { newId } from "../ids";
import { AppError } from "../http";

export function toDto(row: typeof accounts.$inferSelect): AccountDto {
  return { id: row.id, email: row.email, displayName: row.displayName };
}

/** Signing in with an unknown email creates the Account (ADR 0003). Safe under concurrent first sign-ins. */
export async function findOrCreateAccount(db: Database, email: string): Promise<AccountDto> {
  await db.insert(accounts).values({ id: newId(), email }).onConflictDoNothing({ target: accounts.email });
  const [account] = await db.select().from(accounts).where(eq(accounts.email, email));
  if (!account) throw new Error("Account missing after sign-in");
  return toDto(account);
}

export async function setDisplayName(db: Database, accountId: string, displayName: string): Promise<AccountDto> {
  const [row] = await db.update(accounts).set({ displayName }).where(eq(accounts.id, accountId)).returning();
  if (!row) throw new AppError("not_found", "Account not found");
  return toDto(row);
}

/** Hard-deletes the Account and its sessions, after making it a Former member of all its Groups (ADR 0003). */
export async function deleteAccount(db: Database, accountId: string): Promise<void> {
  await db.transaction(async (tx) => {
    await leaveAllGroups(tx, accountId);
    await tx.delete(accounts).where(eq(accounts.id, accountId));
  });
}
