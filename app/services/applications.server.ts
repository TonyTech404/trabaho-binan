import { and, count, desc, eq, gt, inArray, lt, type SQL } from "drizzle-orm";
import type { Database } from "~/db/client.server";
import { applications, jobs, organizations, type ApplicationStatus } from "~/db/schema";
import { APPLICATION_RETENTION_DAYS } from "~/lib/constants";
import { randomId } from "~/lib/ids";
import { checkResume, type ResumeStore } from "~/lib/resume";
import type { ApplicationInput } from "~/lib/validation";
import {
  ConflictError,
  InputError,
  isStaff,
  NotFoundError,
  recordAudit,
  type Actor,
} from "./common.server";

const DAY_MS = 86_400_000;

/**
 * Who may see an application: the staff, and members of the organization the
 * job belongs to. Everyone else gets "not found", never a hint it exists.
 */
function scope(actor: Actor): SQL | undefined {
  if (isStaff(actor)) return undefined;
  if (!actor.organizationId) return eq(applications.id, "00000000-0000-0000-0000-000000000000");
  return eq(applications.organizationId, actor.organizationId);
}

/**
 * Anyone can apply to a published, open job that accepts applications here.
 * The résumé goes to private storage first; if saving the record fails, the
 * file is deleted again.
 */
export async function submitApplication(
  db: Database,
  store: ResumeStore,
  publicId: string,
  input: ApplicationInput,
  resume: { bytes: Uint8Array; filename: string },
  now = new Date(),
) {
  const [job] = await db
    .select({
      id: jobs.id,
      title: jobs.title,
      organizationId: jobs.organizationId,
      acceptsApplications: jobs.acceptsApplications,
      orgStatus: organizations.verificationStatus,
    })
    .from(jobs)
    .innerJoin(organizations, eq(organizations.id, jobs.organizationId))
    .where(and(eq(jobs.publicId, publicId), eq(jobs.status, "published"), gt(jobs.deadlineAt, now)))
    .limit(1);
  if (!job || job.orgStatus === "suspended") {
    throw new NotFoundError("This job is no longer open.");
  }
  if (!job.acceptsApplications) {
    throw new ConflictError("This job does not take applications on Trabaho Biñan.");
  }

  const check = checkResume(resume.bytes, resume.filename);
  if (!check.ok) throw new InputError(check.error, { resume: check.error });

  const id = crypto.randomUUID();
  const key = `applications/${job.id}/${id}`;
  const reference = `TB-${randomId(6).toUpperCase()}`;
  await store.put(key, resume.bytes, check.contentType);
  try {
    await db.insert(applications).values({
      id,
      reference,
      jobId: job.id,
      organizationId: job.organizationId,
      fullName: input.fullName,
      email: input.email,
      phone: input.phone,
      message: input.message,
      resumeKey: key,
      resumeFilename: check.filename,
      resumeContentType: check.contentType,
      resumeSize: resume.bytes.byteLength,
      consentedAt: now,
    });
  } catch (error) {
    await store.delete([key]).catch(() => {});
    throw error;
  }
  return { reference, jobTitle: job.title };
}

const listColumns = {
  id: applications.id,
  reference: applications.reference,
  fullName: applications.fullName,
  status: applications.status,
  createdAt: applications.createdAt,
  jobId: jobs.id,
  jobTitle: jobs.title,
  organizationName: organizations.name,
};

export async function listApplications(
  db: Database,
  actor: Actor,
  filters: { jobId?: string; status?: ApplicationStatus | "" } = {},
) {
  const conditions = [
    scope(actor),
    filters.jobId ? eq(applications.jobId, filters.jobId) : undefined,
    filters.status ? eq(applications.status, filters.status) : undefined,
  ].filter(Boolean) as SQL[];
  return db
    .select(listColumns)
    .from(applications)
    .innerJoin(jobs, eq(jobs.id, applications.jobId))
    .innerJoin(organizations, eq(organizations.id, applications.organizationId))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(applications.createdAt))
    .limit(200);
}

export async function getApplication(db: Database, actor: Actor, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new NotFoundError("Application not found.");
  const conditions = [eq(applications.id, id), scope(actor)].filter(Boolean) as SQL[];
  const [row] = await db
    .select({
      application: applications,
      job: { id: jobs.id, title: jobs.title, publicId: jobs.publicId, slug: jobs.slug },
      organizationName: organizations.name,
    })
    .from(applications)
    .innerJoin(jobs, eq(jobs.id, applications.jobId))
    .innerJoin(organizations, eq(organizations.id, applications.organizationId))
    .where(and(...conditions))
    .limit(1);
  if (!row) throw new NotFoundError("Application not found.");
  return row;
}

export async function updateApplicationStatus(
  db: Database,
  actor: Actor,
  id: string,
  status: ApplicationStatus,
  now = new Date(),
) {
  const { application, job } = await getApplication(db, actor, id);
  if (application.status === status) return application;
  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(applications)
      .set({ status, statusUpdatedAt: now, statusUpdatedById: actor.id })
      .where(eq(applications.id, application.id))
      .returning();
    await recordAudit(tx, actor, {
      action: "application.status",
      entityType: "application",
      entityId: application.id,
      summary: `${application.reference} for ${job.title}: ${application.status} → ${status}`,
    });
    return updated;
  });
}

/** Opens the résumé for an authorised viewer and records who downloaded it. */
export async function openResume(db: Database, store: ResumeStore, actor: Actor, id: string) {
  const { application, job } = await getApplication(db, actor, id);
  const object = await store.get(application.resumeKey);
  if (!object) throw new NotFoundError("The résumé file is no longer available.");
  await recordAudit(db, actor, {
    action: "application.resume_download",
    entityType: "application",
    entityId: application.id,
    summary: `${application.reference} for ${job.title}`,
  });
  return {
    body: object.body,
    size: object.size,
    filename: application.resumeFilename,
    contentType: application.resumeContentType,
  };
}

/** New (unopened) applications, for the dashboard navigation badge. */
export async function countNewApplications(db: Database, actor: Actor) {
  const conditions = [eq(applications.status, "submitted"), scope(actor)].filter(Boolean) as SQL[];
  const [row] = await db
    .select({ n: count() })
    .from(applications)
    .where(and(...conditions));
  return row?.n ?? 0;
}

/** Applications per job, for the job pages in the dashboards. */
export async function countApplicationsForJob(db: Database, actor: Actor, jobId: string) {
  const conditions = [eq(applications.jobId, jobId), scope(actor)].filter(Boolean) as SQL[];
  const [row] = await db
    .select({ n: count() })
    .from(applications)
    .where(and(...conditions));
  return row?.n ?? 0;
}

/** Deletes applications (and their résumés) older than the retention period. */
export async function purgeExpiredApplications(db: Database, store: ResumeStore, now = new Date()) {
  const cutoff = new Date(now.getTime() - APPLICATION_RETENTION_DAYS * DAY_MS);
  let purged = 0;
  for (;;) {
    const batch = await db
      .select({ id: applications.id, key: applications.resumeKey })
      .from(applications)
      .where(lt(applications.createdAt, cutoff))
      .limit(100);
    if (batch.length === 0) return purged;
    await store.delete(batch.map((b) => b.key));
    await db.delete(applications).where(
      inArray(
        applications.id,
        batch.map((b) => b.id),
      ),
    );
    purged += batch.length;
  }
}
