import { sql } from "drizzle-orm";
import {
  boolean,
  customType,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const tsvector = customType<{ data: string }>({
  dataType() {
    return "tsvector";
  },
});

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

/* -------------------------------------------------------------------------- */
/* Enums                                                                      */
/* -------------------------------------------------------------------------- */

export const userRoleEnum = pgEnum("user_role", ["admin", "reviewer", "employer"]);
export const userStatusEnum = pgEnum("user_status", ["active", "suspended"]);

export const organizationTypeEnum = pgEnum("organization_type", ["direct_employer", "agency"]);
export const verificationStatusEnum = pgEnum("verification_status", [
  "unverified",
  "verified",
  "suspended",
]);

export const jobStatusEnum = pgEnum("job_status", [
  "draft",
  "pending_review",
  "changes_requested",
  "rejected",
  "published",
  "paused",
  "closed",
  "expired",
  "archived",
]);

export const employmentTypeEnum = pgEnum("employment_type", [
  "full_time",
  "part_time",
  "contract",
  "temporary",
  "internship",
]);

export const workSetupEnum = pgEnum("work_setup", ["on_site", "hybrid", "remote"]);

export const educationLevelEnum = pgEnum("education_level", [
  "none",
  "elementary",
  "high_school",
  "senior_high",
  "vocational",
  "college_undergraduate",
  "college_graduate",
  "postgraduate",
]);

export const experienceLevelEnum = pgEnum("experience_level", [
  "none",
  "under_1_year",
  "1_to_2_years",
  "3_to_5_years",
  "over_5_years",
]);

export const salaryPeriodEnum = pgEnum("salary_period", ["hour", "day", "month", "year"]);

export const revisionKindEnum = pgEnum("revision_kind", ["edit", "renewal", "reopen"]);
export const revisionStatusEnum = pgEnum("revision_status", [
  "draft",
  "pending_review",
  "changes_requested",
  "approved",
  "rejected",
  "withdrawn",
]);

export const reportReasonEnum = pgEnum("report_reason", [
  "scam_or_fee",
  "filled_or_expired",
  "incorrect_information",
  "discriminatory",
  "inappropriate",
  "other",
]);
export const reportStatusEnum = pgEnum("report_status", ["open", "resolved", "dismissed"]);

export const applicationStatusEnum = pgEnum("application_status", [
  "submitted",
  "reviewed",
  "shortlisted",
  "interview",
  "hired",
  "not_selected",
  "withdrawn",
]);

export const accountLinkPurposeEnum = pgEnum("account_link_purpose", [
  "invitation",
  "password_reset",
]);

/* -------------------------------------------------------------------------- */
/* Authentication (Better Auth)                                               */
/* -------------------------------------------------------------------------- */

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  role: userRoleEnum("role").notNull().default("employer"),
  status: userStatusEnum("status").notNull().default("active"),
  ...timestamps,
});

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    ...timestamps,
  },
  (t) => [index("sessions_user_id_idx").on(t.userId)],
);

export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    ...timestamps,
  },
  (t) => [index("accounts_user_id_idx").on(t.userId)],
);

export const verifications = pgTable(
  "verifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (t) => [index("verifications_identifier_idx").on(t.identifier)],
);

/* -------------------------------------------------------------------------- */
/* Organizations                                                              */
/* -------------------------------------------------------------------------- */

export const organizations = pgTable(
  "organizations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    type: organizationTypeEnum("type").notNull(),
    verificationStatus: verificationStatusEnum("verification_status")
      .notNull()
      .default("unverified"),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    verifiedById: uuid("verified_by_id").references(() => users.id, { onDelete: "set null" }),
    // Public profile
    description: text("description"),
    website: text("website"),
    publicEmail: text("public_email"),
    publicPhone: text("public_phone"),
    officeCity: text("office_city"),
    officeBarangay: text("office_barangay"),
    officeAddress: text("office_address"),
    // Internal only
    internalNotes: text("internal_notes"),
    createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [index("organizations_name_idx").on(t.name)],
);

export const organizationMembers = pgTable(
  "organization_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    // First release: an employer account belongs to exactly one organization.
    userId: uuid("user_id")
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: "cascade" }),
    createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("organization_members_org_idx").on(t.organizationId)],
);

/* -------------------------------------------------------------------------- */
/* Jobs                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Vacancy content shared by `jobs` (current content) and `job_revisions`
 * (proposed changes to a published job awaiting review).
 */
const jobContentColumns = () => ({
  title: text("title").notNull(),
  hiringCompanyName: text("hiring_company_name"),
  description: text("description").notNull(),
  qualifications: text("qualifications"),
  skills: text("skills"),
  educationLevel: educationLevelEnum("education_level").notNull(),
  /** Optional course or field, e.g. "BS Accountancy", for jobs that need a degree. */
  fieldOfStudy: text("field_of_study"),
  experienceLevel: experienceLevelEnum("experience_level").notNull(),
  employmentType: employmentTypeEnum("employment_type").notNull(),
  workSetup: workSetupEnum("work_setup").notNull().default("on_site"),
  workCity: text("work_city").notNull(),
  workBarangay: text("work_barangay"),
  workAddress: text("work_address"),
  salaryMin: integer("salary_min"),
  salaryMax: integer("salary_max"),
  salaryCurrency: text("salary_currency").notNull().default("PHP"),
  salaryPeriod: salaryPeriodEnum("salary_period"),
  openings: integer("openings"),
  applicationUrl: text("application_url"),
  applicationEmail: text("application_email"),
  walkInInstructions: text("walk_in_instructions"),
  /** Applicants can apply on this site with a résumé (stored privately in R2). */
  acceptsApplications: boolean("accepts_applications").notNull().default(false),
  applicationNotes: text("application_notes"),
  deadlineAt: timestamp("deadline_at", { withTimezone: true }).notNull(),
  // Internal only — never rendered on public pages.
  sourceReference: text("source_reference"),
  contactName: text("contact_name"),
  contactEmail: text("contact_email"),
  contactPhone: text("contact_phone"),
});

export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    publicId: text("public_id").notNull().unique(),
    slug: text("slug").notNull(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    status: jobStatusEnum("status").notNull().default("draft"),
    ...jobContentColumns(),
    searchVector: tsvector("search_vector").generatedAlwaysAs(
      sql`to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(hiring_company_name, '') || ' ' || coalesce(skills, '') || ' ' || coalesce(qualifications, '') || ' ' || coalesce(description, ''))`,
    ),
    lastConfirmedAt: timestamp("last_confirmed_at", { withTimezone: true }),
    lastConfirmedById: uuid("last_confirmed_by_id").references(() => users.id, {
      onDelete: "set null",
    }),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    firstPublishedAt: timestamp("first_published_at", { withTimezone: true }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    pausedAt: timestamp("paused_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    closedReason: text("closed_reason"),
    expiredAt: timestamp("expired_at", { withTimezone: true }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
    updatedById: uuid("updated_by_id").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    index("jobs_status_deadline_idx").on(t.status, t.deadlineAt),
    index("jobs_organization_idx").on(t.organizationId),
    index("jobs_search_idx").using("gin", t.searchVector),
  ],
);

export const jobRevisions = pgTable(
  "job_revisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    kind: revisionKindEnum("kind").notNull(),
    status: revisionStatusEnum("status").notNull().default("draft"),
    ...jobContentColumns(),
    createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewedById: uuid("reviewed_by_id").references(() => users.id, { onDelete: "set null" }),
    reviewNote: text("review_note"),
    ...timestamps,
  },
  (t) => [
    index("job_revisions_job_idx").on(t.jobId),
    // At most one open revision per job.
    uniqueIndex("job_revisions_one_open_idx")
      .on(t.jobId)
      .where(sql`status in ('draft', 'pending_review', 'changes_requested')`),
  ],
);

/** Employer-visible timeline of lifecycle and review events for a job. */
export const jobEvents = pgTable(
  "job_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    revisionId: uuid("revision_id").references(() => jobRevisions.id, { onDelete: "set null" }),
    type: text("type").notNull(),
    note: text("note"),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    actorRole: text("actor_role"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("job_events_job_idx").on(t.jobId, t.createdAt)],
);

export const listingReports = pgTable(
  "listing_reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    reason: reportReasonEnum("reason").notNull(),
    details: text("details"),
    reporterContact: text("reporter_contact"),
    status: reportStatusEnum("status").notNull().default("open"),
    resolutionNote: text("resolution_note"),
    resolvedById: uuid("resolved_by_id").references(() => users.id, { onDelete: "set null" }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("listing_reports_status_idx").on(t.status, t.createdAt),
    index("listing_reports_job_idx").on(t.jobId),
  ],
);

/**
 * Applications made on this site. Personal data: visible only to the job's
 * organization and to staff, deleted after the retention period (see
 * services/applications.server.ts). The résumé itself lives in R2 under
 * resumeKey, never in a public bucket.
 */
export const applications = pgTable(
  "applications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Short reference shown to the applicant. */
    reference: text("reference").notNull().unique(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    fullName: text("full_name").notNull(),
    email: text("email"),
    phone: text("phone"),
    message: text("message"),
    /** Short work history, for applicants without a résumé. */
    experience: text("experience"),
    status: applicationStatusEnum("status").notNull().default("submitted"),
    statusUpdatedAt: timestamp("status_updated_at", { withTimezone: true }),
    statusUpdatedById: uuid("status_updated_by_id").references(() => users.id, {
      onDelete: "set null",
    }),
    consentedAt: timestamp("consented_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("applications_org_idx").on(t.organizationId, t.createdAt),
    index("applications_job_idx").on(t.jobId, t.createdAt),
    index("applications_created_idx").on(t.createdAt),
  ],
);

/**
 * Files sent with an application (résumé pages or photos). Optional; up to
 * three per application. The bytes live in the private R2 bucket under `key`.
 */
export const applicationFiles = pgTable(
  "application_files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    applicationId: uuid("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    filename: text("filename").notNull(),
    contentType: text("content_type").notNull(),
    size: integer("size").notNull(),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("application_files_application_idx").on(t.applicationId, t.position)],
);

/** Daily aggregates only — no per-visitor data is stored. */
export const jobMetricsDaily = pgTable(
  "job_metrics_daily",
  {
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    day: date("day").notNull(),
    views: integer("views").notNull().default(0),
    applyClicks: integer("apply_clicks").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.jobId, t.day] })],
);

/* -------------------------------------------------------------------------- */
/* Administration                                                             */
/* -------------------------------------------------------------------------- */

export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    actorRole: text("actor_role"),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    summary: text("summary"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("audit_events_entity_idx").on(t.entityType, t.entityId),
    index("audit_events_created_idx").on(t.createdAt),
  ],
);

/** Single-use links for invitations and administrator-issued password resets. */
export const accountLinks = pgTable(
  "account_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tokenHash: text("token_hash").notNull().unique(),
    purpose: accountLinkPurposeEnum("purpose").notNull(),
    email: text("email"),
    role: userRoleEnum("role"),
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "cascade",
    }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("account_links_email_idx").on(t.email)],
);

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").$type<unknown>().notNull(),
  updatedById: uuid("updated_by_id").references(() => users.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;
export type Organization = typeof organizations.$inferSelect;
export type Job = typeof jobs.$inferSelect;
export type JobRevision = typeof jobRevisions.$inferSelect;
export type JobEvent = typeof jobEvents.$inferSelect;
export type ListingReport = typeof listingReports.$inferSelect;
export type Application = typeof applications.$inferSelect;
export type ApplicationFile = typeof applicationFiles.$inferSelect;
export type ApplicationStatus = (typeof applicationStatusEnum.enumValues)[number];
export type AuditEvent = typeof auditEvents.$inferSelect;
export type AccountLink = typeof accountLinks.$inferSelect;
export type UserRole = (typeof userRoleEnum.enumValues)[number];
export type JobStatus = (typeof jobStatusEnum.enumValues)[number];
