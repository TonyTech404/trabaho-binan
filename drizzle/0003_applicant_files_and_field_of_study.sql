CREATE TABLE "application_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"key" text NOT NULL,
	"filename" text NOT NULL,
	"content_type" text NOT NULL,
	"size" integer NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "experience" text;--> statement-breakpoint
ALTER TABLE "job_revisions" ADD COLUMN "field_of_study" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "field_of_study" text;--> statement-breakpoint
ALTER TABLE "application_files" ADD CONSTRAINT "application_files_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "application_files_application_idx" ON "application_files" USING btree ("application_id","position");