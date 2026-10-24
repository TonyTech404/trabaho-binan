CREATE TYPE "public"."application_status" AS ENUM('submitted', 'reviewed', 'shortlisted', 'interview', 'hired', 'not_selected', 'withdrawn');--> statement-breakpoint
CREATE TABLE "applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference" text NOT NULL,
	"job_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"full_name" text NOT NULL,
	"email" text,
	"phone" text,
	"message" text,
	"resume_key" text NOT NULL,
	"resume_filename" text NOT NULL,
	"resume_content_type" text NOT NULL,
	"resume_size" integer NOT NULL,
	"status" "application_status" DEFAULT 'submitted' NOT NULL,
	"status_updated_at" timestamp with time zone,
	"status_updated_by_id" uuid,
	"consented_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "applications_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
ALTER TABLE "job_revisions" ADD COLUMN "accepts_applications" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "accepts_applications" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_status_updated_by_id_users_id_fk" FOREIGN KEY ("status_updated_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "applications_org_idx" ON "applications" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "applications_job_idx" ON "applications" USING btree ("job_id","created_at");--> statement-breakpoint
CREATE INDEX "applications_created_idx" ON "applications" USING btree ("created_at");