import { and, eq, inArray, lte } from "drizzle-orm";
import type { Database } from "~/db/client.server";
import {
  jobRevisions,
  jobs,
  organizations,
  users,
  type Job,
  type JobRevision,
  type JobStatus,
} from "~/db/schema";
import { randomId, slugify } from "~/lib/ids";
import type { JobInput } from "~/lib/validation";
import {
  ConflictError,
  ForbiddenError,
  InputError,
  isStaff,
  isUuid,
  NotFoundError,
  recordAudit,
  recordJobEvent,
  requireStaff,
  type Actor,
  type Tx,
} from "./common.server";

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

export const JOB_CONTENT_KEYS = [
  "title",
  "hiringCompanyName",
  "description",
  "qualifications",
  "skills",
  "educationLevel",
  "fieldOfStudy",
  "experienceLevel",
  "employmentType",
  "workSetup",
  "workCity",
  "workBarangay",
  "workAddress",
  "salaryMin",
  "salaryMax",
  "salaryPeriod",
  "openings",
  "applicationUrl",
  "applicationEmail",
  "walkInInstructions",
  "acceptsApplications",
  "applicationNotes",
  "deadlineAt",
  "sourceReference",
  "contactName",
  "contactEmail",
  "contactPhone",
] as const satisfies readonly (keyof JobInput & keyof Job)[];

type JobContent = Pick<JobInput, (typeof JOB_CONTENT_KEYS)[number]>;

/** Statuses in which a job has a public page (live or with a closed notice). */
export const PUBLICLY_VISIBLE_STATUSES: JobStatus[] = [
  "published",
  "paused",
  "closed",
  "expired",
  "archived",
];

function pickContent(source: JobContent): JobContent {
  const out = {} as Record<string, unknown>;
  for (const key of JOB_CONTENT_KEYS) out[key] = source[key];
  return out as JobContent;
}

function sameValue(a: unknown, b: unknown) {
  if (a instanceof Date || b instanceof Date) {
    return a instanceof Date && b instanceof Date && a.getTime() === b.getTime();
  }
  return (a ?? null) === (b ?? null);
}

export function changedContentFields(current: JobContent, next: JobContent): string[] {
  return JOB_CONTENT_KEYS.filter((key) => !sameValue(current[key], next[key]));
}

function assertStatus(job: Pick<Job, "status">, allowed: JobStatus[], message: string) {
  if (!allowed.includes(job.status)) throw new ConflictError(message);
}

function assertFutureDeadline(deadlineAt: Date, now: Date) {
  if (deadlineAt.getTime() <= now.getTime()) {
    throw new ConflictError("The deadline has passed. Set a new deadline first.");
  }
}

async function lockJob(tx: Tx, actor: Actor, jobId: string): Promise<Job> {
  if (!isUuid(jobId)) throw new NotFoundError("Job not found.");
  const [job] = await tx.select().from(jobs).where(eq(jobs.id, jobId)).for("update").limit(1);
  // Employers get "not found" for other organizations' jobs: existence is not revealed.
  if (!job || (!isStaff(actor) && job.organizationId !== actor.organizationId)) {
    throw new NotFoundError("Job not found.");
  }
  return job;
}

async function assertOrganizationActive(tx: Tx, organizationId: string) {
  const [org] = await tx
    .select({ status: organizations.verificationStatus })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    // Holds off a concurrent suspension until this change is committed.
    .for("share")
    .limit(1);
  if (!org) throw new NotFoundError("Organization not found.");
  if (org.status === "suspended") {
    throw new ConflictError("This organization is suspended. Contact the review team.");
  }
}

function audit(
  tx: Tx,
  actor: Actor,
  action: string,
  job: Pick<Job, "id" | "title">,
  extra?: {
    summary?: string;
    metadata?: Record<string, unknown>;
  },
) {
  return recordAudit(tx, actor, {
    action,
    entityType: "job",
    entityId: job.id,
    summary: extra?.summary ?? job.title,
    metadata: extra?.metadata,
  });
}

/* -------------------------------------------------------------------------- */
/* Create and edit                                                            */
/* -------------------------------------------------------------------------- */

export async function createJob(
  db: Database,
  actor: Actor,
  input: JobInput,
  options: { organizationId?: string | null } = {},
): Promise<Job> {
  // Employers always post for their own organization, whatever the form says.
  const organizationId = isStaff(actor) ? options.organizationId : actor.organizationId;
  if (!organizationId || !isUuid(organizationId)) {
    if (isStaff(actor))
      throw new InputError("Choose an employer.", { organizationId: "Choose an employer." });
    throw new ForbiddenError("Your account is not linked to an organization.");
  }

  return db.transaction(async (tx) => {
    await assertOrganizationActive(tx, organizationId);
    const content = pickContent(input);
    const [job] = await tx
      .insert(jobs)
      .values({
        ...content,
        publicId: randomId(8),
        slug: slugify(content.title),
        organizationId,
        status: "draft",
        createdById: actor.id,
        updatedById: actor.id,
      })
      .returning();
    await recordJobEvent(tx, actor, { jobId: job.id, type: "created" });
    await audit(tx, actor, "job.create", job);
    return job;
  });
}

/**
 * Edits a job in place.
 * - Employers may edit only drafts and listings returned for changes.
 *   Published listings change through `proposeRevision` and another review.
 * - Staff (who approve listings) may correct any active listing directly;
 *   the change is audited.
 */
export async function updateJob(
  db: Database,
  actor: Actor,
  jobId: string,
  input: JobInput,
): Promise<Job> {
  return db.transaction(async (tx) => {
    const job = await lockJob(tx, actor, jobId);
    if (isStaff(actor)) {
      assertStatus(
        job,
        ["draft", "pending_review", "changes_requested", "published", "paused"],
        "This listing can no longer be edited.",
      );
    } else {
      await assertOrganizationActive(tx, job.organizationId);
      assertStatus(
        job,
        ["draft", "changes_requested"],
        "Published listings are changed by submitting the changes for review.",
      );
    }

    const content = pickContent(input);
    const changed = changedContentFields(job, content);
    if (changed.length === 0) return job;

    const status: JobStatus =
      !isStaff(actor) && job.status === "changes_requested" ? "draft" : job.status;
    const [updated] = await tx
      .update(jobs)
      .set({ ...content, slug: slugify(content.title), status, updatedById: actor.id })
      .where(eq(jobs.id, job.id))
      .returning();
    await recordJobEvent(tx, actor, { jobId: job.id, type: "edited" });
    await audit(tx, actor, "job.edit", updated, {
      metadata: { changed, statusBefore: job.status },
    });
    return updated;
  });
}

/* -------------------------------------------------------------------------- */
/* Review and lifecycle                                                       */
/* -------------------------------------------------------------------------- */

export async function submitJob(db: Database, actor: Actor, jobId: string, now = new Date()) {
  return db.transaction(async (tx) => {
    const job = await lockJob(tx, actor, jobId);
    await assertOrganizationActive(tx, job.organizationId);
    assertStatus(job, ["draft", "changes_requested"], "Only drafts can be submitted for review.");
    assertFutureDeadline(job.deadlineAt, now);
    const [updated] = await tx
      .update(jobs)
      .set({ status: "pending_review", submittedAt: now, updatedById: actor.id })
      .where(eq(jobs.id, job.id))
      .returning();
    await recordJobEvent(tx, actor, { jobId: job.id, type: "submitted" });
    await audit(tx, actor, "job.submit", updated);
    return updated;
  });
}

export async function withdrawSubmission(db: Database, actor: Actor, jobId: string) {
  return db.transaction(async (tx) => {
    const job = await lockJob(tx, actor, jobId);
    assertStatus(job, ["pending_review"], "Only listings waiting for review can be withdrawn.");
    const [updated] = await tx
      .update(jobs)
      .set({ status: "draft", updatedById: actor.id })
      .where(eq(jobs.id, job.id))
      .returning();
    await recordJobEvent(tx, actor, { jobId: job.id, type: "withdrawn" });
    await audit(tx, actor, "job.withdraw", updated);
    return updated;
  });
}

/**
 * Approve and publish. Staff only; employers can never publish their own listings.
 * A reviewer's approval also confirms the vacancy is open; pass
 * `confirmedOpen: false` when nobody checked with the employer (imports).
 */
export async function approveJob(
  db: Database,
  actor: Actor,
  jobId: string,
  note: string | null = null,
  now = new Date(),
  options: { confirmedOpen?: boolean; expectedUpdatedAt?: string } = {},
) {
  const confirmedOpen = options.confirmedOpen ?? true;
  requireStaff(actor);
  return db.transaction(async (tx) => {
    const job = await lockJob(tx, actor, jobId);
    assertStatus(
      job,
      ["draft", "pending_review", "changes_requested"],
      "Only drafts and listings waiting for review can be approved.",
    );
    // Approve only what the reviewer saw: refuse if the listing changed since.
    if (options.expectedUpdatedAt && job.updatedAt.toISOString() !== options.expectedUpdatedAt) {
      throw new ConflictError("The listing changed after you opened it. Check it again.");
    }
    // Staff may publish their own drafts, but not an employer's unsent draft.
    if (job.status === "draft") {
      const [creator] = job.createdById
        ? await tx
            .select({ role: users.role })
            .from(users)
            .where(eq(users.id, job.createdById))
            .limit(1)
        : [];
      if (creator?.role !== "admin" && creator?.role !== "reviewer") {
        throw new ConflictError("The employer has not submitted this draft yet.");
      }
    }
    await assertOrganizationActive(tx, job.organizationId);
    assertFutureDeadline(job.deadlineAt, now);
    const [updated] = await tx
      .update(jobs)
      .set({
        status: "published",
        publishedAt: now,
        firstPublishedAt: job.firstPublishedAt ?? now,
        lastConfirmedAt: confirmedOpen ? now : job.lastConfirmedAt,
        lastConfirmedById: confirmedOpen ? actor.id : job.lastConfirmedById,
        updatedById: actor.id,
      })
      .where(eq(jobs.id, job.id))
      .returning();
    await recordJobEvent(tx, actor, { jobId: job.id, type: "approved", note });
    await audit(tx, actor, "job.approve", updated, { metadata: { statusBefore: job.status } });
    return updated;
  });
}

export async function requestJobChanges(db: Database, actor: Actor, jobId: string, reason: string) {
  requireStaff(actor);
  return db.transaction(async (tx) => {
    const job = await lockJob(tx, actor, jobId);
    assertStatus(job, ["pending_review"], "Only listings waiting for review can be returned.");
    const [updated] = await tx
      .update(jobs)
      .set({ status: "changes_requested", updatedById: actor.id })
      .where(eq(jobs.id, job.id))
      .returning();
    await recordJobEvent(tx, actor, { jobId: job.id, type: "changes_requested", note: reason });
    await audit(tx, actor, "job.request_changes", updated, { metadata: { reason } });
    return updated;
  });
}

export async function rejectJob(db: Database, actor: Actor, jobId: string, reason: string) {
  requireStaff(actor);
  return db.transaction(async (tx) => {
    const job = await lockJob(tx, actor, jobId);
    assertStatus(
      job,
      ["draft", "pending_review", "changes_requested"],
      "Only unpublished listings can be rejected. Close or pause published listings instead.",
    );
    const [updated] = await tx
      .update(jobs)
      .set({ status: "rejected", updatedById: actor.id })
      .where(eq(jobs.id, job.id))
      .returning();
    await recordJobEvent(tx, actor, { jobId: job.id, type: "rejected", note: reason });
    await audit(tx, actor, "job.reject", updated, { metadata: { reason } });
    return updated;
  });
}

/** Hide a published listing immediately, e.g. while a report is investigated. */
export async function pauseJob(
  db: Database,
  actor: Actor,
  jobId: string,
  reason: string,
  now = new Date(),
) {
  requireStaff(actor);
  return db.transaction(async (tx) => {
    const job = await lockJob(tx, actor, jobId);
    assertStatus(job, ["published"], "Only published listings can be paused.");
    const [updated] = await tx
      .update(jobs)
      .set({ status: "paused", pausedAt: now, updatedById: actor.id })
      .where(eq(jobs.id, job.id))
      .returning();
    await recordJobEvent(tx, actor, { jobId: job.id, type: "paused", note: reason });
    await audit(tx, actor, "job.pause", updated, { metadata: { reason } });
    return updated;
  });
}

export async function resumeJob(db: Database, actor: Actor, jobId: string, now = new Date()) {
  requireStaff(actor);
  return db.transaction(async (tx) => {
    const job = await lockJob(tx, actor, jobId);
    assertStatus(job, ["paused"], "Only paused listings can be resumed.");
    await assertOrganizationActive(tx, job.organizationId);
    assertFutureDeadline(job.deadlineAt, now);
    const [updated] = await tx
      .update(jobs)
      .set({ status: "published", pausedAt: null, updatedById: actor.id })
      .where(eq(jobs.id, job.id))
      .returning();
    await recordJobEvent(tx, actor, { jobId: job.id, type: "resumed" });
    await audit(tx, actor, "job.resume", updated);
    return updated;
  });
}

/** Close a filled or withdrawn vacancy. The employer or staff can do this at any time. */
export async function closeJob(
  db: Database,
  actor: Actor,
  jobId: string,
  reason: string,
  now = new Date(),
) {
  return db.transaction(async (tx) => {
    const job = await lockJob(tx, actor, jobId);
    assertStatus(job, ["published", "paused"], "Only published or paused listings can be closed.");
    const [updated] = await tx
      .update(jobs)
      .set({ status: "closed", closedAt: now, closedReason: reason, updatedById: actor.id })
      .where(eq(jobs.id, job.id))
      .returning();
    await recordJobEvent(tx, actor, { jobId: job.id, type: "closed", note: reason });
    await audit(tx, actor, "job.close", updated, { metadata: { reason } });
    return updated;
  });
}

export async function archiveJob(db: Database, actor: Actor, jobId: string, now = new Date()) {
  requireStaff(actor);
  return db.transaction(async (tx) => {
    const job = await lockJob(tx, actor, jobId);
    assertStatus(
      job,
      ["draft", "rejected", "closed", "expired"],
      "Close the listing before archiving it.",
    );
    const [updated] = await tx
      .update(jobs)
      .set({ status: "archived", archivedAt: now, updatedById: actor.id })
      .where(eq(jobs.id, job.id))
      .returning();
    await recordJobEvent(tx, actor, { jobId: job.id, type: "archived" });
    await audit(tx, actor, "job.archive", updated);
    return updated;
  });
}

/**
 * Staff renewal after confirming with the employer that the opening is still
 * available. Extends the deadline; reopens closed or expired listings.
 */
export async function renewJob(
  db: Database,
  actor: Actor,
  jobId: string,
  deadlineAt: Date,
  now = new Date(),
) {
  requireStaff(actor);
  return db.transaction(async (tx) => {
    const job = await lockJob(tx, actor, jobId);
    assertStatus(
      job,
      ["published", "paused", "closed", "expired"],
      "Only published, closed or expired listings can be renewed.",
    );
    await assertOrganizationActive(tx, job.organizationId);
    assertFutureDeadline(deadlineAt, now);
    const reopen = job.status === "closed" || job.status === "expired";
    const [updated] = await tx
      .update(jobs)
      .set({
        deadlineAt,
        status: reopen ? "published" : job.status,
        publishedAt: reopen ? now : job.publishedAt,
        closedAt: null,
        closedReason: null,
        expiredAt: null,
        lastConfirmedAt: now,
        lastConfirmedById: actor.id,
        updatedById: actor.id,
      })
      .where(eq(jobs.id, job.id))
      .returning();
    await recordJobEvent(tx, actor, { jobId: job.id, type: reopen ? "reopened" : "renewed" });
    await audit(tx, actor, reopen ? "job.reopen" : "job.renew", updated, {
      metadata: {
        deadlineBefore: job.deadlineAt.toISOString(),
        deadlineAfter: deadlineAt.toISOString(),
      },
    });
    return updated;
  });
}

/** Record that someone confirmed the opening is still available, without other changes. */
export async function confirmJob(db: Database, actor: Actor, jobId: string, now = new Date()) {
  return db.transaction(async (tx) => {
    const job = await lockJob(tx, actor, jobId);
    assertStatus(job, ["published", "paused"], "Only active listings can be confirmed.");
    const [updated] = await tx
      .update(jobs)
      .set({ lastConfirmedAt: now, lastConfirmedById: actor.id })
      .where(eq(jobs.id, job.id))
      .returning();
    await recordJobEvent(tx, actor, { jobId: job.id, type: "confirmed" });
    await audit(tx, actor, "job.confirm", updated);
    return updated;
  });
}

/** Expire every active listing whose deadline has passed. Run by the cron trigger. */
export async function expireDueJobs(db: Database, now = new Date()) {
  return db.transaction(async (tx) => {
    const expired = await tx
      .update(jobs)
      .set({ status: "expired", expiredAt: now })
      .where(and(inArray(jobs.status, ["published", "paused"]), lte(jobs.deadlineAt, now)))
      .returning({
        id: jobs.id,
        publicId: jobs.publicId,
        slug: jobs.slug,
        title: jobs.title,
        organizationId: jobs.organizationId,
      });
    for (const job of expired) {
      await recordJobEvent(tx, null, { jobId: job.id, type: "expired" });
    }
    if (expired.length > 0) {
      await recordAudit(tx, null, {
        action: "job.expire",
        entityType: "job",
        summary: `${expired.length} listing(s) expired at deadline`,
        metadata: { jobIds: expired.map((j) => j.id) },
      });
    }
    return expired;
  });
}

/* -------------------------------------------------------------------------- */
/* Revisions to published listings (employer → review)                        */
/* -------------------------------------------------------------------------- */

export type RevisionKind = "edit" | "renewal" | "reopen";

const REVISION_ALLOWED: Record<RevisionKind, JobStatus[]> = {
  edit: ["published", "paused"],
  renewal: ["published", "paused"],
  reopen: ["closed", "expired"],
};

const OPEN_REVISION_STATUSES = ["draft", "pending_review", "changes_requested"] as const;

/**
 * An employer proposes changes to a published (or closed/expired) listing.
 * The approved version stays live until a reviewer approves the revision.
 */
export async function proposeRevision(
  db: Database,
  actor: Actor,
  jobId: string,
  input: JobInput,
  kind: RevisionKind,
  now = new Date(),
): Promise<JobRevision> {
  if (isStaff(actor)) {
    throw new ForbiddenError("Staff edit or renew published listings directly.");
  }
  return db.transaction(async (tx) => {
    const job = await lockJob(tx, actor, jobId);
    await assertOrganizationActive(tx, job.organizationId);
    assertStatus(
      job,
      REVISION_ALLOWED[kind],
      kind === "reopen"
        ? "Only closed or expired listings can be reopened."
        : "Only published listings can be changed this way.",
    );
    assertFutureDeadline(input.deadlineAt, now);

    const content = pickContent(input);
    const [open] = await tx
      .select()
      .from(jobRevisions)
      .where(
        and(
          eq(jobRevisions.jobId, job.id),
          inArray(jobRevisions.status, [...OPEN_REVISION_STATUSES]),
        ),
      )
      .for("update")
      .limit(1);

    let revision: JobRevision;
    if (open) {
      [revision] = await tx
        .update(jobRevisions)
        .set({ ...content, kind, status: "pending_review", submittedAt: now, reviewNote: null })
        .where(eq(jobRevisions.id, open.id))
        .returning();
    } else {
      [revision] = await tx
        .insert(jobRevisions)
        .values({
          ...content,
          jobId: job.id,
          kind,
          status: "pending_review",
          submittedAt: now,
          createdById: actor.id,
        })
        .returning();
    }
    await recordJobEvent(tx, actor, {
      jobId: job.id,
      revisionId: revision.id,
      type: "revision_submitted",
    });
    await audit(tx, actor, "revision.submit", job, {
      metadata: { revisionId: revision.id, kind, changed: changedContentFields(job, content) },
    });
    return revision;
  });
}

export async function withdrawRevision(db: Database, actor: Actor, revisionId: string) {
  return db.transaction(async (tx) => {
    const revision = await lockRevision(tx, revisionId);
    const job = await lockJob(tx, actor, revision.jobId);
    if (revision.status !== "pending_review" && revision.status !== "changes_requested") {
      throw new ConflictError("This revision is no longer open.");
    }
    const [updated] = await tx
      .update(jobRevisions)
      .set({ status: "withdrawn" })
      .where(eq(jobRevisions.id, revision.id))
      .returning();
    await recordJobEvent(tx, actor, {
      jobId: job.id,
      revisionId: revision.id,
      type: "revision_withdrawn",
    });
    await audit(tx, actor, "revision.withdraw", job, { metadata: { revisionId: revision.id } });
    return updated;
  });
}

async function lockRevision(tx: Tx, revisionId: string) {
  if (!isUuid(revisionId)) throw new NotFoundError("Revision not found.");
  const [revision] = await tx
    .select()
    .from(jobRevisions)
    .where(eq(jobRevisions.id, revisionId))
    .for("update")
    .limit(1);
  if (!revision) throw new NotFoundError("Revision not found.");
  return revision;
}

export type RevisionDecision = "approve" | "request_changes" | "reject";

export async function reviewRevision(
  db: Database,
  actor: Actor,
  revisionId: string,
  decision: RevisionDecision,
  note: string | null,
  now = new Date(),
  expectedSubmittedAt?: string,
): Promise<{ job: Job; revision: JobRevision }> {
  requireStaff(actor);
  if (decision !== "approve" && !note) {
    throw new InputError("Give a reason.", { reason: "Give a reason." });
  }
  return db.transaction(async (tx) => {
    const revision = await lockRevision(tx, revisionId);
    const job = await lockJob(tx, actor, revision.jobId);
    if (revision.status !== "pending_review") {
      throw new ConflictError("This revision is not waiting for review.");
    }
    if (
      decision === "approve" &&
      expectedSubmittedAt &&
      revision.submittedAt?.toISOString() !== expectedSubmittedAt
    ) {
      throw new ConflictError("The employer changed the proposal. Check it again.");
    }

    if (decision !== "approve") {
      const status = decision === "reject" ? "rejected" : "changes_requested";
      const [updated] = await tx
        .update(jobRevisions)
        .set({ status, reviewedAt: now, reviewedById: actor.id, reviewNote: note })
        .where(eq(jobRevisions.id, revision.id))
        .returning();
      const type = decision === "reject" ? "revision_rejected" : "revision_changes_requested";
      await recordJobEvent(tx, actor, { jobId: job.id, revisionId: revision.id, type, note });
      await audit(tx, actor, `revision.${decision}`, job, {
        metadata: { revisionId: revision.id, reason: note },
      });
      return { job, revision: updated };
    }

    await assertOrganizationActive(tx, job.organizationId);
    assertFutureDeadline(revision.deadlineAt, now);
    const republish =
      (revision.kind === "reopen" || revision.kind === "renewal") &&
      (job.status === "closed" || job.status === "expired");
    if (job.status === "archived" || job.status === "rejected") {
      throw new ConflictError("This listing is no longer active.");
    }

    const content = pickContent(revision);
    const changed = changedContentFields(job, content);
    const [updatedJob] = await tx
      .update(jobs)
      .set({
        ...content,
        slug: slugify(content.title),
        status: republish ? "published" : job.status,
        publishedAt: republish ? now : job.publishedAt,
        closedAt: republish ? null : job.closedAt,
        closedReason: republish ? null : job.closedReason,
        expiredAt: republish ? null : job.expiredAt,
        lastConfirmedAt: now,
        lastConfirmedById: actor.id,
        updatedById: actor.id,
      })
      .where(eq(jobs.id, job.id))
      .returning();
    const [updatedRevision] = await tx
      .update(jobRevisions)
      .set({ status: "approved", reviewedAt: now, reviewedById: actor.id, reviewNote: note })
      .where(eq(jobRevisions.id, revision.id))
      .returning();
    await recordJobEvent(tx, actor, {
      jobId: job.id,
      revisionId: revision.id,
      type: "revision_approved",
      note,
    });
    if (republish) await recordJobEvent(tx, actor, { jobId: job.id, type: "reopened" });
    await audit(tx, actor, "revision.approve", updatedJob, {
      metadata: { revisionId: revision.id, kind: revision.kind, changed, republished: republish },
    });
    return { job: updatedJob, revision: updatedRevision };
  });
}
