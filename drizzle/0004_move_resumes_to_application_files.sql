-- Keep existing résumés: each becomes the first file of its application.
INSERT INTO "application_files" ("application_id", "key", "filename", "content_type", "size", "position", "created_at")
SELECT "id", "resume_key", "resume_filename", "resume_content_type", "resume_size", 0, "created_at" FROM "applications";--> statement-breakpoint
ALTER TABLE "applications" DROP COLUMN "resume_key";--> statement-breakpoint
ALTER TABLE "applications" DROP COLUMN "resume_filename";--> statement-breakpoint
ALTER TABLE "applications" DROP COLUMN "resume_content_type";--> statement-breakpoint
ALTER TABLE "applications" DROP COLUMN "resume_size";