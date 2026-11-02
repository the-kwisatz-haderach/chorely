ALTER TABLE "members" DROP CONSTRAINT "members_account_id_accounts_id_fk";
--> statement-breakpoint
ALTER TABLE "members" ALTER COLUMN "account_id" DROP NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "members" ADD CONSTRAINT "members_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
