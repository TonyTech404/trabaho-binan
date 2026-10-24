import {
  aliasedTable,
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  ilike,
  inArray,
  lt,
  lte,
  or,
  sql,
} from "drizzle-orm";
import type { Database } from "~/db/client.server";
import {
  jobEvents,
  jobMetricsDaily,
  jobRevisions,
  jobs,
  listingReports,
  organizations,
  users,
  type JobStatus,
} from "~/db/schema";
import { isStaff, NotFoundError, requireStaff, type Actor } from "./common.server";

import { EXPIRING_WITHIN_DAYS, RECONFIRM_AFTER_DAYS } from "~/lib/constants";
const DAY_MS = 24 * 60 * 60 * 1000;

/** A job with everything its dashboard page needs, if the actor may see it. */
export async function getJobForActor(db: Database, actor: Actor, jobId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(jobId)) throw new NotFoundError("Job not found.");
  const confirmedBy = aliasedTable(users, "confirmed_by");
  const [row] = await db
    .select({
      job: jobs,
      organization: organizations,
      lastConfirmedByName: confirmedBy.name,
    })
    .from(jobs)
    .innerJoin(organizations, eq(organizations.id, jobs.organizationId))
    .leftJoin(confirmedBy, eq(confirmedBy.id, jobs.lastConfirmedById))
    .where(eq(jobs.id, jobId))
    .limit(1);
  // Same response for "missing" and "belongs to another organization".
  if (!row || (!isStaff(actor) && row.job.organizationId !== actor.organizationId)) {
    throw new NotFoundError("Job not found.");
  }

  const [revisions, events, metrics] = await Promise.all([
    db
      .select()
      .from(jobRevisions)
      .where(eq(jobRevisions.jobId, jobId))
      .orderBy(desc(jobRevisions.createdAt))
      .limit(20),
    db
      .select({
        id: jobEvents.id,
        type: jobEvents.type,
        note: jobEvents.note,
        createdAt: jobEvents.createdAt,
        actorRole: jobEvents.actorRole,
        actorName: users.name,
      })
      .from(jobEvents)
      .leftJoin(users, eq(users.id, jobEvents.actorId))
      .where(eq(jobEvents.jobId, jobId))
      .orderBy(desc(jobEvents.createdAt))
      .limit(100),
    db
      .select({
        views: sql<number>`coalesce(sum(${jobMetricsDaily.views}), 0)::int`,
        applyClicks: sql<number>`coalesce(sum(${jobMetricsDaily.applyClicks}), 0)::int`,
      })
      .from(jobMetricsDaily)
      .where(eq(jobMetricsDaily.jobId, jobId)),
  ]);

  const openRevision = revisions.find((r) =>
    ["draft", "pending_review", "changes_requested"].includes(r.status),
  );
  return {
    ...row,
    openRevision: openRevision ?? null,
    revisions,
    // Staff see who acted; employers see the role only, not staff names.
    events: isStaff(actor)
      ? events
      : events.map((e) => ({ ...e, actorName: e.actorRole === "employer" ? e.actorName : null })),
    metrics: metrics[0] ?? { views: 0, applyClicks: 0 },
  };
}

export type JobForActor = Awaited<ReturnType<typeof getJobForActor>>;

const listColumns = {
  id: jobs.id,
  publicId: jobs.publicId,
  slug: jobs.slug,
  title: jobs.title,
  status: jobs.status,
  deadlineAt: jobs.deadlineAt,
  updatedAt: jobs.updatedAt,
  submittedAt: jobs.submittedAt,
  publishedAt: jobs.publishedAt,
  lastConfirmedAt: jobs.lastConfirmedAt,
  workCity: jobs.workCity,
  deadlinePassed: sql<boolean>`${jobs.deadlineAt} <= now()`,
  organizationId: organizations.id,
  organizationName: organizations.name,
  hasOpenRevision: sql<boolean>`exists (select 1 from ${jobRevisions} where ${jobRevisions.jobId} = ${jobs.id} and ${jobRevisions.status} in ('pending_review', 'changes_requested'))`,
  openReports: sql<number>`(select count(*)::int from ${listingReports} where ${listingReports.jobId} = ${jobs.id} and ${listingReports.status} = 'open')`,
};

export const STAFF_JOB_PAGE_SIZE = 50;

export async function listJobsForStaff(
  db: Database,
  actor: Actor,
  filters: { status?: string; q?: string; organizationId?: string; page?: number },
) {
  requireStaff(actor);
  const conditions = [];
  if (filters.status === "active") conditions.push(inArray(jobs.status, ["published", "paused"]));
  else if (filters.status) conditions.push(eq(jobs.status, filters.status as JobStatus));
  else conditions.push(sql`${jobs.status} <> 'archived'`);
  if (filters.q) {
    const like = `%${filters.q.replace(/[\\%_]/g, "\\$&")}%`;
    conditions.push(
      or(ilike(jobs.title, like), ilike(organizations.name, like), eq(jobs.publicId, filters.q)),
    );
  }
  if (filters.organizationId && /^[0-9a-f-]{36}$/i.test(filters.organizationId)) {
    conditions.push(eq(jobs.organizationId, filters.organizationId));
  }
  const page = Math.max(1, filters.page ?? 1);
  const where = and(...conditions);
  const [rows, [{ total }]] = await Promise.all([
    db
      .select(listColumns)
      .from(jobs)
      .innerJoin(organizations, eq(organizations.id, jobs.organizationId))
      .where(where)
      .orderBy(desc(jobs.updatedAt))
      .limit(STAFF_JOB_PAGE_SIZE)
      .offset((page - 1) * STAFF_JOB_PAGE_SIZE),
    db
      .select({ total: count() })
      .from(jobs)
      .innerJoin(organizations, eq(organizations.id, jobs.organizationId))
      .where(where),
  ]);
  return {
    jobs: rows,
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / STAFF_JOB_PAGE_SIZE)),
  };
}

export async function listJobsForOrganization(db: Database, actor: Actor) {
  if (!actor.organizationId) throw new NotFoundError();
  return db
    .select(listColumns)
    .from(jobs)
    .innerJoin(organizations, eq(organizations.id, jobs.organizationId))
    .where(and(eq(jobs.organizationId, actor.organizationId), sql`${jobs.status} <> 'archived'`))
    .orderBy(desc(jobs.updatedAt))
    .limit(200);
}

export async function listReviewQueue(db: Database, actor: Actor) {
  requireStaff(actor);
  const [pendingJobs, pendingRevisions] = await Promise.all([
    db
      .select({
        id: jobs.id,
        title: jobs.title,
        submittedAt: jobs.submittedAt,
        deadlineAt: jobs.deadlineAt,
        description: jobs.description,
        qualifications: jobs.qualifications,
        organizationName: organizations.name,
        organizationStatus: organizations.verificationStatus,
      })
      .from(jobs)
      .innerJoin(organizations, eq(organizations.id, jobs.organizationId))
      .where(eq(jobs.status, "pending_review"))
      .orderBy(asc(jobs.submittedAt)),
    db
      .select({
        id: jobRevisions.id,
        jobId: jobs.id,
        kind: jobRevisions.kind,
        title: jobRevisions.title,
        liveTitle: jobs.title,
        jobStatus: jobs.status,
        submittedAt: jobRevisions.submittedAt,
        description: jobRevisions.description,
        qualifications: jobRevisions.qualifications,
        organizationName: organizations.name,
        organizationStatus: organizations.verificationStatus,
      })
      .from(jobRevisions)
      .innerJoin(jobs, eq(jobs.id, jobRevisions.jobId))
      .innerJoin(organizations, eq(organizations.id, jobs.organizationId))
      .where(eq(jobRevisions.status, "pending_review"))
      .orderBy(asc(jobRevisions.submittedAt)),
  ]);
  return { pendingJobs, pendingRevisions };
}

export async function getStaffOverview(db: Database, actor: Actor, now = new Date()) {
  requireStaff(actor);
  const soon = new Date(now.getTime() + EXPIRING_WITHIN_DAYS * DAY_MS);
  const stale = new Date(now.getTime() - RECONFIRM_AFTER_DAYS * DAY_MS);
  const live = and(eq(jobs.status, "published"), gt(jobs.deadlineAt, now));

  const [[counts], expiring, needsConfirmation] = await Promise.all([
    db
      .select({
        pendingJobs: sql<number>`(select count(*)::int from ${jobs} where ${jobs.status} = 'pending_review')`,
        pendingRevisions: sql<number>`(select count(*)::int from ${jobRevisions} where ${jobRevisions.status} = 'pending_review')`,
        openReports: sql<number>`(select count(*)::int from ${listingReports} where ${listingReports.status} = 'open')`,
        liveJobs: sql<number>`(select count(*)::int from ${jobs} where ${jobs.status} = 'published' and ${jobs.deadlineAt} > ${now})`,
        pausedJobs: sql<number>`(select count(*)::int from ${jobs} where ${jobs.status} = 'paused')`,
        unverifiedEmployers: sql<number>`(select count(*)::int from ${organizations} where ${organizations.verificationStatus} = 'unverified')`,
      })
      .from(sql`(select 1) as one`),
    db
      .select({
        id: jobs.id,
        title: jobs.title,
        deadlineAt: jobs.deadlineAt,
        organizationName: organizations.name,
      })
      .from(jobs)
      .innerJoin(organizations, eq(organizations.id, jobs.organizationId))
      .where(and(live, lte(jobs.deadlineAt, soon)))
      .orderBy(asc(jobs.deadlineAt))
      .limit(20),
    db
      .select({
        id: jobs.id,
        title: jobs.title,
        lastConfirmedAt: jobs.lastConfirmedAt,
        organizationName: organizations.name,
      })
      .from(jobs)
      .innerJoin(organizations, eq(organizations.id, jobs.organizationId))
      .where(and(live, or(lt(jobs.lastConfirmedAt, stale), sql`${jobs.lastConfirmedAt} is null`)))
      .orderBy(asc(jobs.lastConfirmedAt))
      .limit(20),
  ]);
  return { counts, expiring, needsConfirmation };
}

/** Small badge counts for the staff navigation. */
export async function getStaffNavCounts(db: Database) {
  const [row] = await db
    .select({
      review: sql<number>`((select count(*) from ${jobs} where ${jobs.status} = 'pending_review') + (select count(*) from ${jobRevisions} where ${jobRevisions.status} = 'pending_review'))::int`,
      reports: sql<number>`(select count(*)::int from ${listingReports} where ${listingReports.status} = 'open')`,
    })
    .from(sql`(select 1) as one`);
  return row ?? { review: 0, reports: 0 };
}

/**
 * Agreed export columns: listing facts only. Internal contact details are
 * personal data and are deliberately left out.
 */
export async function exportJobs(db: Database, actor: Actor) {
  requireStaff(actor);
  return db
    .select({
      publicId: jobs.publicId,
      title: jobs.title,
      employer: organizations.name,
      employerType: organizations.type,
      employerVerification: organizations.verificationStatus,
      status: jobs.status,
      employmentType: jobs.employmentType,
      workSetup: jobs.workSetup,
      workCity: jobs.workCity,
      workBarangay: jobs.workBarangay,
      educationLevel: jobs.educationLevel,
      experienceLevel: jobs.experienceLevel,
      salaryMin: jobs.salaryMin,
      salaryMax: jobs.salaryMax,
      salaryPeriod: jobs.salaryPeriod,
      openings: jobs.openings,
      firstPublishedAt: jobs.firstPublishedAt,
      deadlineAt: jobs.deadlineAt,
      lastConfirmedAt: jobs.lastConfirmedAt,
      closedAt: jobs.closedAt,
      closedReason: jobs.closedReason,
      views: sql<number>`(select coalesce(sum(${jobMetricsDaily.views}), 0)::int from ${jobMetricsDaily} where ${jobMetricsDaily.jobId} = ${jobs.id})`,
      applyClicks: sql<number>`(select coalesce(sum(${jobMetricsDaily.applyClicks}), 0)::int from ${jobMetricsDaily} where ${jobMetricsDaily.jobId} = ${jobs.id})`,
    })
    .from(jobs)
    .innerJoin(organizations, eq(organizations.id, jobs.organizationId))
    .orderBy(desc(jobs.createdAt));
}

export async function listOrganizationJobsForStaff(
  db: Database,
  actor: Actor,
  organizationId: string,
) {
  requireStaff(actor);
  return db
    .select(listColumns)
    .from(jobs)
    .innerJoin(organizations, eq(organizations.id, jobs.organizationId))
    .where(eq(jobs.organizationId, organizationId))
    .orderBy(desc(jobs.updatedAt))
    .limit(200);
}
