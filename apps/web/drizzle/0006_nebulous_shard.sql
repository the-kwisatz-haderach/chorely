ALTER TABLE "chores" ADD COLUMN "completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "chores" ADD COLUMN "completed_by_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "chores" ADD CONSTRAINT "chores_completed_by_id_members_id_fk" FOREIGN KEY ("completed_by_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chores_group_completed_idx" ON "chores" USING btree ("group_id","completed_at","id");