import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

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

/**
 * A Member is a membership row: Account x Group. A Member who leaves keeps the row with a null `accountId`, a
 * "Former member" (ADR 0003). Deleting an Account must make its Members Former members first, so the key restricts.
 */
export const members = pgTable(
  "members",
  {
    id: uuid("id").primaryKey(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    accountId: uuid("account_id").references(() => accounts.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("members_group_account_unique").on(t.groupId, t.accountId), index("members_account_id_idx").on(t.accountId)],
);

/**
 * A Group's one Invite link. The hash is how a join finds the Group; `tokenCiphertext` (AES-GCM, keyed from
 * `AUTH_SECRET`) lets any Member read the link back. Replacing the link overwrites both. Null means no readable copy.
 */
export const inviteLinks = pgTable(
  "invite_links",
  {
    groupId: uuid("group_id")
      .primaryKey()
      .references(() => groups.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    tokenCiphertext: text("token_ciphertext"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("invite_links_token_hash_unique").on(t.tokenHash)],
);

/**
 * The schedule a Recurring Chore's Occurrences share. `weekdays` (ISO, 1 is Monday) is set only for `week`, and
 * `day_of_month` only for `month`. Deleting it ("Stop repeating") leaves every Occurrence as a one-off.
 */
export const recurrences = pgTable(
  "recurrences",
  {
    id: uuid("id").primaryKey(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    unit: text("unit", { enum: ["day", "week", "month"] }).notNull(),
    every: integer("every").notNull(),
    weekdays: integer("weekdays").array(),
    dayOfMonth: integer("day_of_month"),
    anchor: text("anchor", { enum: ["calendar", "completion"] }).notNull(),
    /** The fixed Assignee each new Occurrence gets; null leaves them unassigned. */
    assigneeId: uuid("assignee_id").references(() => members.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      "recurrences_shape",
      sql`(${t.unit} = 'week') = (${t.weekdays} is not null) and (${t.unit} = 'month') = (${t.dayOfMonth} is not null)`,
    ),
  ],
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
    /** Set when the Chore is completed; a completed Chore keeps its `position` so Undo can restore its place. */
    completedAt: timestamp("completed_at", { withTimezone: true }),
    /** Null while open, and for a completer who has since left (a "Former member"). */
    completedById: uuid("completed_by_id").references(() => members.id, { onDelete: "set null" }),
    /** Set on every Occurrence of a Recurring Chore. */
    recurrenceId: uuid("recurrence_id").references(() => recurrences.id, { onDelete: "set null" }),
    /** The Occurrence whose completion created this one, so undoing that completion can remove it. */
    previousOccurrenceId: uuid("previous_occurrence_id").references((): AnyPgColumn => chores.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // A Recurring Chore has only one open Occurrence at a time.
    uniqueIndex("chores_one_open_occurrence_idx").on(t.recurrenceId).where(sql`${t.completedAt} is null`),
    index("chores_previous_occurrence_idx").on(t.previousOccurrenceId),
    index("chores_group_position_idx").on(t.groupId, t.position, t.id), index("chores_group_completed_idx").on(t.groupId, t.completedAt, t.id)],
);
