import { index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

// Primary keys are app-generated UUIDv7 (ADR 0001), so no database default.
export const accounts = pgTable("accounts", {
  id: uuid("id").primaryKey(),
  email: text("email").notNull().unique(),
  displayName: text("display_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** One-time sign-in codes (ADR 0003). The code itself is never stored, only its keyed hash. */
export const loginCodes = pgTable(
  "login_codes",
  {
    id: uuid("id").primaryKey(),
    email: text("email").notNull(),
    codeHash: text("code_hash").notNull(),
    attempts: integer("attempts").notNull().default(0),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("login_codes_email_idx").on(t.email), index("login_codes_expires_at_idx").on(t.expiresAt)],
);

/** Database-backed sessions. The primary key is the hash of the opaque token the client holds. */
export const sessions = pgTable(
  "sessions",
  {
    tokenHash: text("token_hash").primaryKey(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("sessions_expires_at_idx").on(t.expiresAt), index("sessions_account_id_idx").on(t.accountId)],
);

/** Fixed-window counters for rate limiting, keyed like `code:email:a@b.c`. */
export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
  count: integer("count").notNull(),
});
