import { and, asc, count, desc, eq, gt, inArray, lt, sql, type SQL } from "drizzle-orm";
import type { Database } from "~/db/client.server";
import {
  applicationFiles,
  applications,
  jobs,
  organizations,
  type ApplicationStatus,
} from "~/db/schema";
import { APPLICATION_RETENTION_DAYS } from "~/lib/constants";
import { randomId } from "~/lib/ids";
import { checkFile, MAX_FILES, MAX_TOTAL_BYTES, type ResumeStore } from "~/lib/resume";
import { normalizePhMobile, type ApplicationInput } from "~/lib/validation";
import {
  ConflictError,
  InputError,
  isStaff,
  NotFoundError,
  recordAudit,
  requireStaff,
  type Actor,
} from "./common.server";
import { closeJob } from "./jobs.server";

const DAY_MS = 86_400_000;

/** Statuses that still wait on a decision; closing a filled job can settle them. */
const OPEN_STATUSES: ApplicationStatus[] = ["submitted", "reviewed", "shortlisted", "interview"];

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
 * Files are optional (up to three). They go to private storage first; if
 * saving the record fails, they are deleted again.
 */
export async function submitApplication(
  db: Database,
  store: ResumeStore,
  publicId: string,
  input: ApplicationInput,
  files: { bytes: Uint8Array; filename: string }[] = [],
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

  if (files.length > MAX_FILES) {
    throw new InputError("Attach up to three files.", { files: "Attach up to three files." });
  }
  const checked = files.map((f) => checkFile(f.bytes, f.filename));
  const failed = checked.find((c) => !c.ok);
  if (failed && !failed.ok) throw new InputError(failed.error, { files: failed.error });
  const ready = checked.filter((c) => c.ok);
  if (ready.reduce((n, c) => n + c.bytes.byteLength, 0) > MAX_TOTAL_BYTES) {
    const error = "The files add up to more than 10 MB. Send fewer or smaller files.";
    throw new InputError(error, { files: error });
  }

  const id = crypto.randomUUID();
  const reference = `TB-${randomId(6).toUpperCase()}`;
  const stored = ready.map((c, position) => ({
    ...c,
    position,
    key: `applications/${job.id}/${id}/${position}`,
  }));
  try {
    // Inside the try: if a later upload or the insert fails, every file
    // already stored is deleted again rather than left behind in R2.
    for (const f of stored) await store.put(f.key, f.bytes, f.contentType);
    await db.transaction(async (tx) => {
      await tx.insert(applications).values({
        id,
        reference,
        jobId: job.id,
        organizationId: job.organizationId,
        fullName: input.fullName,
        email: input.email,
        phone: input.phone,
        experience: input.experience,
        message: input.message,
        consentedAt: now,
      });
      if (stored.length) {
        await tx.insert(applicationFiles).values(
          stored.map((f) => ({
            applicationId: id,
            key: f.key,
            filename: f.filename,
            contentType: f.contentType,
            size: f.bytes.byteLength,
            position: f.position,
          })),
        );
      }
    });
  } catch (error) {
    await store.delete(stored.map((f) => f.key)).catch(() => {});
    throw error;
  }
  return { reference, jobTitle: job.title };
}

const listColumns = {
  id: applications.id,
  reference: applications.reference,
  fullName: applications.fullName,
  phone: applications.phone,
  status: applications.status,
  createdAt: applications.createdAt,
  jobId: jobs.id,
  jobTitle: jobs.title,
  organizationName: organizations.name,
  fileCount: sql<number>`(select count(*)::int from ${applicationFiles} where ${applicationFiles.applicationId} = ${applications.id})`,
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
      job: {
        id: jobs.id,
        title: jobs.title,
        publicId: jobs.publicId,
        slug: jobs.slug,
        status: jobs.status,
        openings: jobs.openings,
      },
      organizationName: organizations.name,
    })
    .from(applications)
    .innerJoin(jobs, eq(jobs.id, applications.jobId))
    .innerJoin(organizations, eq(organizations.id, applications.organizationId))
    .where(and(...conditions))
    .limit(1);
  if (!row) throw new NotFoundError("Application not found.");
  const files = await db
    .select({
      id: applicationFiles.id,
      filename: applicationFiles.filename,
      contentType: applicationFiles.contentType,
      size: applicationFiles.size,
    })
    .from(applicationFiles)
    .where(eq(applicationFiles.applicationId, row.application.id))
    .orderBy(asc(applicationFiles.position));
  const [hires] = await db
    .select({ n: count() })
    .from(applications)
    .where(and(eq(applications.jobId, row.job.id), eq(applications.status, "hired")));
  const [waiting] = await db
    .select({ n: count() })
    .from(applications)
    .where(and(eq(applications.jobId, row.job.id), inArray(applications.status, OPEN_STATUSES)));
  return { ...row, files, hires: hires?.n ?? 0, waiting: waiting?.n ?? 0 };
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

/**
 * After a hire: close the job (it leaves search and stops taking
 * applications) and, if asked, tell everyone still waiting that they were not
 * selected, so they are not left waiting.
 */
export async function closeFilledJob(
  db: Database,
  actor: Actor,
  applicationId: string,
  options: { notifyOthers: boolean },
  now = new Date(),
) {
  const { application, job } = await getApplication(db, actor, applicationId);
  if (application.status !== "hired") {
    throw new ConflictError("Mark the applicant as hired first.");
  }
  let closedJob = null;
  if (job.status === "published" || job.status === "paused") {
    closedJob = await closeJob(db, actor, job.id, "filled", now);
  }
  let settled = 0;
  if (options.notifyOthers) {
    settled = await db.transaction(async (tx) => {
      const rows = await tx
        .update(applications)
        .set({ status: "not_selected", statusUpdatedAt: now, statusUpdatedById: actor.id })
        .where(and(eq(applications.jobId, job.id), inArray(applications.status, OPEN_STATUSES)))
        .returning({ id: applications.id });
      if (rows.length) {
        await recordAudit(tx, actor, {
          action: "application.not_selected_bulk",
          entityType: "job",
          entityId: job.id,
          summary: `${rows.length} other applicant(s) for ${job.title} marked not selected after a hire`,
        });
      }
      return rows.length;
    });
  }
  return { closedJob, settled };
}

/** Opens one attached file for an authorised viewer and records the access. */
export async function openApplicationFile(
  db: Database,
  store: ResumeStore,
  actor: Actor,
  applicationId: string,
  fileId: string,
  access: "view" | "download" = "download",
) {
  const { application, job } = await getApplication(db, actor, applicationId);
  if (!/^[0-9a-f-]{36}$/i.test(fileId)) throw new NotFoundError("File not found.");
  const [file] = await db
    .select()
    .from(applicationFiles)
    .where(and(eq(applicationFiles.id, fileId), eq(applicationFiles.applicationId, application.id)))
    .limit(1);
  if (!file) throw new NotFoundError("File not found.");
  const object = await store.get(file.key);
  if (!object) throw new NotFoundError("The file is no longer available.");
  // The audit log outlives the application, so it records which file (by
  // position), never its name: file names often contain the applicant's name.
  await recordAudit(db, actor, {
    action: access === "view" ? "application.file_view" : "application.file_download",
    entityType: "application",
    entityId: application.id,
    summary: `${application.reference} for ${job.title}: file ${file.position + 1}`,
  });
  return {
    body: object.body,
    size: object.size,
    filename: file.filename,
    contentType: file.contentType,
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

/**
 * Hires recorded by employers (or staff) for applications made on this site.
 * These are confirmed by the hiring side; they do not include hires from
 * listings that link to other sites.
 */
export async function countHires(db: Database, actor: Actor, now = new Date()) {
  requireStaff(actor);
  const since = new Date(now.getTime() - 30 * DAY_MS);
  const [row] = await db
    .select({
      total: count(),
      recent: sql<number>`count(*) filter (where ${applications.statusUpdatedAt} >= ${since})::int`,
    })
    .from(applications)
    .where(eq(applications.status, "hired"));
  return { total: row?.total ?? 0, last30Days: row?.recent ?? 0 };
}

/**
 * Lets an applicant check their application with the reference they were
 * given and the mobile number or email they applied with. Both must match;
 * otherwise nothing is revealed.
 */
export async function lookupApplicationStatus(db: Database, reference: string, contact: string) {
  const ref = reference.trim().toUpperCase().replace(/^TB-?/, "TB-");
  if (!/^TB-[0-9A-Z]{6}$/.test(ref)) return null;
  const [row] = await db
    .select({
      reference: applications.reference,
      phone: applications.phone,
      email: applications.email,
      status: applications.status,
      createdAt: applications.createdAt,
      statusUpdatedAt: applications.statusUpdatedAt,
      jobTitle: jobs.title,
      jobStatus: jobs.status,
      jobPublicId: jobs.publicId,
      jobSlug: jobs.slug,
      organizationName: organizations.name,
    })
    .from(applications)
    .innerJoin(jobs, eq(jobs.id, applications.jobId))
    .innerJoin(organizations, eq(organizations.id, applications.organizationId))
    .where(eq(applications.reference, ref))
    .limit(1);
  if (!row) return null;
  const phone = normalizePhMobile(contact);
  const email = contact.trim().toLowerCase();
  // Older applications may hold the number as typed, so compare normalised forms.
  const matches =
    (phone && normalizePhMobile(row.phone ?? "") === phone) || (!!email && row.email === email);
  if (!matches) return null;
  const { phone: _p, email: _e, ...safe } = row;
  return safe;
}

/**
 * Staff delete an application and its files: spam, or a person asking for
 * their data to be removed. Only the reference, job and reason are kept, in
 * the audit history.
 */
export async function deleteApplication(
  db: Database,
  store: ResumeStore,
  actor: Actor,
  applicationId: string,
  reason: string,
) {
  requireStaff(actor);
  const { application, job } = await getApplication(db, actor, applicationId);
  const files = await db
    .select({ key: applicationFiles.key })
    .from(applicationFiles)
    .where(eq(applicationFiles.applicationId, application.id));
  // Files first: if this fails, the application is still there to try again.
  await store.delete(files.map((f) => f.key));
  await db.transaction(async (tx) => {
    await tx.delete(applications).where(eq(applications.id, application.id));
    await recordAudit(tx, actor, {
      action: "application.delete",
      entityType: "application",
      entityId: application.id,
      summary: `${application.reference} for ${job.title}`,
      metadata: { reason, files: files.length },
    });
  });
}

/** Deletes applications (and their files) older than the retention period. */
export async function purgeExpiredApplications(db: Database, store: ResumeStore, now = new Date()) {
  const cutoff = new Date(now.getTime() - APPLICATION_RETENTION_DAYS * DAY_MS);
  let purged = 0;
  for (;;) {
    const batch = await db
      .select({ id: applications.id })
      .from(applications)
      .where(lt(applications.createdAt, cutoff))
      .limit(100);
    if (batch.length === 0) return purged;
    const ids = batch.map((b) => b.id);
    const keys = await db
      .select({ key: applicationFiles.key })
      .from(applicationFiles)
      .where(inArray(applicationFiles.applicationId, ids));
    await store.delete(keys.map((k) => k.key));
    await db.delete(applications).where(inArray(applications.id, ids));
    purged += batch.length;
  }
}
