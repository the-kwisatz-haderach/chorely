import { date, index, integer, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

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

export const groups = pgTable("groups", {
  id: uuid("id").primaryKey(),
  name: text("name").notNull(),
  /** Bumped in the same transaction as every Chore mutation, so clients can tell when to refetch. */
  revision: integer("revision").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** A Member is a membership row: Account x Group. */
export const members = pgTable(
  "members",
  {
    id: uuid("id").primaryKey(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("members_group_account_unique").on(t.groupId, t.accountId), index("members_account_id_idx").on(t.accountId)],
);

/**
 * `position` is a fractional-index key (ADR 0002). The migration gives it `COLLATE "C"` by hand because
 * Drizzle cannot express it; the Queue is ordered by `(position, id)`.
 */
export const chores = pgTable(
  "chores",
  {
    id: uuid("id").primaryKey(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    note: text("note").notNull().default(""),
    dueDate: date("due_date", { mode: "string" }),
    assigneeId: uuid("assignee_id").references(() => members.id, { onDelete: "set null" }),
    position: text("position").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("chores_group_position_idx").on(t.groupId, t.position, t.id)],
);
