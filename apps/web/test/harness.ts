import { randomUUID } from "node:crypto";
import { count } from "drizzle-orm";
import postgres from "postgres";
import { createApiClient, type ApiClient, type FetchLike } from "@chorely/api-client";
import { createDb } from "../src/server/db/client";
import { accounts } from "../src/server/db/schema";
import { setDeps } from "../src/server/deps";
import type { Email } from "../src/server/email";
import * as health from "../src/app/api/v1/health/route";
import { adminUrl, databaseUrl, TEMPLATE_DB } from "./db-urls";

type Handler = (req: Request) => Promise<Response> | Response;

/** Route table mirroring `src/app/api/v1`. Add new route modules here. */
const routes: Record<string, Partial<Record<string, Handler>>> = {
  "/api/v1/health": { GET: health.GET },
};

export interface TestApp {
  client: ApiClient;
  /** Emails passed to the fake `sendEmail`, in order. */
  sentEmails: Email[];
  insertAccount(email: string): Promise<void>;
  countAccounts(): Promise<number>;
  /** Closes the app's database connections so requests hit a failing database. */
  breakDatabase(): Promise<void>;
  close(): Promise<void>;
}

/** Calls route handlers in-process, with no HTTP server. */
const routeFetch: FetchLike = async (url, init) => {
  const handler = routes[new URL(url).pathname]?.[init?.method ?? "GET"];
  const res = handler
    ? await handler(new Request(url, init))
    : Response.json({ code: "not_found", message: "No such route" }, { status: 404 });
  return { status: res.status, text: () => res.text() };
};

/** A fresh, migrated database cloned from the template, wired into the route handlers. */
export async function createTestApp(): Promise<TestApp> {
  const name = `chorely_test_${randomUUID().replace(/-/g, "")}`;
  const admin = postgres(adminUrl(), { max: 1, onnotice: () => {} });
  try {
    await admin.unsafe(`create database ${name} template ${TEMPLATE_DB}`);
  } finally {
    await admin.end();
  }

  const { db, sql } = createDb(databaseUrl(name));
  const sentEmails: Email[] = [];
  setDeps({
    db,
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
    async insertAccount(email) {
      await db.insert(accounts).values({ id: randomUUID(), email });
    },
    async countAccounts() {
      const [row] = await db.select({ n: count() }).from(accounts);
      return row?.n ?? 0;
    },
    breakDatabase: endConnections,
    async close() {
      setDeps(undefined);
      await endConnections();
      const cleanup = postgres(adminUrl(), { max: 1, onnotice: () => {} });
      try {
        await cleanup.unsafe(`drop database if exists ${name} with (force)`);
      } finally {
        await cleanup.end();
      }
    },
  };
}
