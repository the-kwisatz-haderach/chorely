import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

// Primary keys are app-generated UUIDv7 (ADR 0001), so no database default.
export const accounts = pgTable("accounts", {
  id: uuid("id").primaryKey(),
  email: text("email").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
