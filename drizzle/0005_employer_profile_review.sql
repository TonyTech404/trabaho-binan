ALTER TABLE "organizations" ADD COLUMN "pending_profile" jsonb;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "pending_profile_submitted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "profile_review_note" text;