import type { AccountDto } from "@chorely/api-client";
import type { Deps } from "../deps";
import { findOrCreateAccount } from "./accounts";
import { consumeCode } from "./codes";
import { createSession } from "./sessions";

/** A right code signs the person in, creating their Account on first sign-in. */
export async function verifyCode(
  deps: Deps,
  email: string,
  code: string,
): Promise<{ account: AccountDto; token: string }> {
  await consumeCode(deps, email, code);
  const account = await findOrCreateAccount(deps.db, email);
  return { account, token: await createSession(deps, account.id) };
}
