import type { AccountDto } from "@chorely/api-client";
import { authenticate, SESSION_TTL_MS } from "./sessions";
import type { Deps } from "../deps";
import { AppError } from "../http";

const COOKIE = "chorely_session";

/** The session token from `Authorization: Bearer` (native) or the session cookie (web). */
export function tokenFrom(req: Request): string | undefined {
  const bearer = /^Bearer (.+)$/i.exec(req.headers.get("authorization") ?? "")?.[1];
  if (bearer) return bearer;
  for (const part of (req.headers.get("cookie") ?? "").split(";")) {
    const [name, ...value] = part.trim().split("=");
    if (name === COOKIE) return value.join("=") || undefined;
  }
  return undefined;
}

export interface AuthedRequest {
  account: AccountDto;
  /** Adds a fresh session cookie to `res` when the session rolled forward, so web sessions roll too. */
  withSession(res: Response): Response;
}

export async function requireAccount(deps: Deps, req: Request): Promise<AuthedRequest> {
  const token = tokenFrom(req);
  const auth = await authenticate(deps, token);
  if (!auth || !token) throw new AppError("unauthenticated", "Sign in to continue");
  const viaCookie = !req.headers.get("authorization");
  return {
    account: auth.account,
    withSession(res) {
      if (auth.refreshed && viaCookie) res.headers.append("set-cookie", sessionCookie(token));
      return res;
    },
  };
}

function cookieAttributes(): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `Path=/; HttpOnly; SameSite=Lax${secure}`;
}

export function sessionCookie(token: string): string {
  return `${COOKIE}=${token}; ${cookieAttributes()}; Max-Age=${SESSION_TTL_MS / 1000}`;
}

export function clearedSessionCookie(): string {
  return `${COOKIE}=; ${cookieAttributes()}; Max-Age=0`;
}

/**
 * The client IP as appended by our own proxy. Entries to the left of it are client-supplied and
 * spoofable, so we count from the right: `TRUSTED_PROXY_HOPS` (default 1) proxies append to the header.
 */
export function clientIp(req: Request): string {
  const hops = Math.max(1, Number(process.env.TRUSTED_PROXY_HOPS) || 1);
  const chain = (req.headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((ip) => ip.trim())
    .filter(Boolean);
  return chain[chain.length - hops] ?? "unknown";
}
