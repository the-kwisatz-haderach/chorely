CREATE TABLE IF NOT EXISTS "recurrences" (
	"id" uuid PRIMARY KEY NOT NULL,
	"group_id" uuid NOT NULL,
	"unit" text NOT NULL,
	"every" integer NOT NULL,
	"weekdays" integer[],
	"day_of_month" integer,
	"anchor" text NOT NULL,
	"assignee_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recurrences_shape" CHECK (("recurrences"."unit" = 'week') = ("recurrences"."weekdays" is not null) and ("recurrences"."unit" = 'month') = ("recurrences"."day_of_month" is not null))
);
--> statement-breakpoint
ALTER TABLE "chores" ADD COLUMN "recurrence_id" uuid;--> statement-breakpoint
ALTER TABLE "chores" ADD COLUMN "previous_occurrence_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "recurrences" ADD CONSTRAINT "recurrences_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "recurrences" ADD CONSTRAINT "recurrences_assignee_id_members_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "chores" ADD CONSTRAINT "chores_recurrence_id_recurrences_id_fk" FOREIGN KEY ("recurrence_id") REFERENCES "public"."recurrences"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "chores" ADD CONSTRAINT "chores_previous_occurrence_id_chores_id_fk" FOREIGN KEY ("previous_occurrence_id") REFERENCES "public"."chores"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "chores_one_open_occurrence_idx" ON "chores" USING btree ("recurrence_id") WHERE "chores"."completed_at" is null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chores_previous_occurrence_idx" ON "chores" USING btree ("previous_occurrence_id");