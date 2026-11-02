import { randomUUID } from "node:crypto";
import { count } from "drizzle-orm";
import { createApiClient, type ApiClient, type FetchLike } from "@chorely/api-client";
import { createDb } from "../src/server/db/client";
import { accounts, loginCodes, rateLimits, sessions } from "../src/server/db/schema";
import { setDeps } from "../src/server/deps";
import type { Email } from "../src/server/email";
import { newId } from "../src/server/ids";
import { withAdmin } from "./db-admin";
import { databaseUrl, TEMPLATE_DB } from "./db-urls";

type Handler = (req: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<Response> | Response;
type RouteModule = Partial<Record<string, Handler>>;

interface Route {
  pattern: RegExp;
  paramNames: string[];
  module: RouteModule;
}

/** Discovers every `src/app/api/v1/**\/route.ts`, so new routes need no harness edit. */
const routes: Route[] = Object.entries(
  import.meta.glob<RouteModule>("../src/app/api/v1/**/route.ts", { eager: true }),
).map(([file, module]) => {
  const segments = file.replace("../src/app", "").replace(/\/route\.ts$/, "").split("/").filter(Boolean);
  const paramNames: string[] = [];
  const pattern = segments
    .map((segment) => {
      const param = /^\[(\w+)\]$/.exec(segment)?.[1];
      if (!param) return `/${segment}`;
      paramNames.push(param);
      return "/([^/]+)";
    })
    .join("");
  return { pattern: new RegExp(`^${pattern}$`), paramNames, module };
});

function findRoute(pathname: string, method: string) {
  for (const route of routes) {
    const match = route.pattern.exec(pathname);
    const handler = route.module[method];
    if (match && handler) {
      const params = Object.fromEntries(route.paramNames.map((name, i) => [name, match[i + 1] ?? ""]));
      return { handler, params };
    }
  }
  return undefined;
}

export interface TestApp {
  client: ApiClient;
  /** Emails passed to the fake `sendEmail`, in order. */
  sentEmails: Email[];
  /** The most recent sign-in code emailed to `email`. */
  lastCode(email: string): string;
  /** Moves the app's clock forward. */
  advance(ms: number): void;
  /** A client of the same app that sends `token` as a bearer token. */
  clientWithToken(token: string | undefined): ApiClient;
  /** Calls a route directly, for checks the typed client hides (cookies, headers). */
  rawFetch(path: string, init?: { method?: string; headers?: Record<string, string>; body?: unknown }): Promise<Response>;
  /** Raw stored values, to check secrets are not persisted in the clear. */
  storedCodeHashes(): Promise<string[]>;
  storedSessionKeys(): Promise<string[]>;
  tableCounts(): Promise<{ loginCodes: number; sessions: number; rateLimits: number }>;
  insertAccount(email: string): Promise<void>;
  countAccounts(): Promise<number>;
  /** Closes the app's database connections so requests hit a failing database. */
  breakDatabase(): Promise<void>;
  close(): Promise<void>;
}

/** Calls route handlers in-process, with no HTTP server. */
async function callRoute(url: string, init?: RequestInit): Promise<Response> {
  const found = findRoute(new URL(url).pathname, init?.method ?? "GET");
  return found
    ? await found.handler(new Request(url, init), { params: Promise.resolve(found.params) })
    : Response.json({ code: "not_found", message: "No such route" }, { status: 404 });
}

const routeFetch: FetchLike = async (url, init) => {
  const res = await callRoute(url, init);
  return { status: res.status, text: () => res.text() };
};

/** A fresh, migrated database cloned from the template, wired into the route handlers. */
export async function createTestApp(): Promise<TestApp> {
  const name = `chorely_test_${randomUUID().replace(/-/g, "")}`;
  await withAdmin((admin) => admin.unsafe(`create database ${name} template ${TEMPLATE_DB}`));

  const { db, sql } = createDb(databaseUrl(name));
  const sentEmails: Email[] = [];
  let nowMs = Date.parse("2030-01-01T00:00:00Z");
  setDeps({
    db,
    now: () => new Date(nowMs),
    authSecret: "test-secret",
    sendEmail: async (email) => {
      sentEmails.push(email);
    },
  });

  let ended = false;
  const endConnections = async () => {
    if (ended) return;
    ended = true;
    await sql.end();
  };

  return {
    client: createApiClient({ baseUrl: "http://test.local", fetch: routeFetch }),
    sentEmails,
    lastCode(email) {
      const sent = sentEmails.filter((e) => e.to === email).at(-1);
      const code = sent && /\b(\d{6})\b/.exec(sent.text)?.[1];
      if (!code) throw new Error(`No sign-in code was emailed to ${email}`);
      return code;
    },
    advance(ms) {
      nowMs += ms;
    },
    clientWithToken(token) {
      return createApiClient({ baseUrl: "http://test.local", fetch: routeFetch, getToken: () => token });
    },
    async rawFetch(path, init) {
      const { body, ...rest } = init ?? {};
      return callRoute(`http://test.local/api/v1${path}`, {
        ...rest,
        headers: { "content-type": "application/json", ...rest.headers },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    },
    async storedCodeHashes() {
      return (await db.select({ h: loginCodes.codeHash }).from(loginCodes)).map((r) => r.h);
    },
    async storedSessionKeys() {
      return (await db.select({ h: sessions.tokenHash }).from(sessions)).map((r) => r.h);
    },
    async tableCounts() {
      const n = async (table: typeof loginCodes | typeof sessions | typeof rateLimits) =>
        (await db.select({ n: count() }).from(table))[0]?.n ?? 0;
      return { loginCodes: await n(loginCodes), sessions: await n(sessions), rateLimits: await n(rateLimits) };
    },
    async insertAccount(email) {
      await db.insert(accounts).values({ id: newId(), email });
    },
    async countAccounts() {
      const [row] = await db.select({ n: count() }).from(accounts);
      return row?.n ?? 0;
    },
    breakDatabase: endConnections,
    async close() {
      setDeps(undefined);
      await endConnections();
      await withAdmin((admin) => admin.unsafe(`drop database if exists ${name} with (force)`));
    },
  };
}
