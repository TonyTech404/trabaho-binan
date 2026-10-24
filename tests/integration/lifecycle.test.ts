import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { auditEvents, jobEvents, jobs } from "~/db/schema";
import { addDaysToDateString, endOfManilaDay, manilaDateString } from "~/lib/time";
import { ConflictError, type Actor } from "~/services/common.server";
import { getJobForActor } from "~/services/job-queries.server";
import {
  approveJob,
  archiveJob,
  closeJob,
  createJob,
  expireDueJobs,
  pauseJob,
  proposeRevision,
  rejectJob,
  renewJob,
  requestJobChanges,
  resumeJob,
  reviewRevision,
  submitJob,
  updateJob,
  withdrawSubmission,
} from "~/services/jobs.server";
import { setOrganizationVerification } from "~/services/organizations.server";
import { getPublicJob, parsePublicFilters, searchPublicJobs } from "~/services/public-jobs.server";
import { describeDb, testDb } from "../helpers/db";
import { admin, jobInput, makeOrganization, makeUser } from "../helpers/factories";

describeDb("vacancy lifecycle", () => {
  const db = testDb();
  let reviewer: Actor;
  let employer: Actor;
  let orgId: string;

  const search = async (q: string) =>
    (await searchPublicJobs(db, parsePublicFilters(new URLSearchParams({ q })))).jobs.map(
      (j) => j.title,
    );

  beforeAll(async () => {
    reviewer = await makeUser(db, "reviewer", { inviter: await admin(db) });
    const org = await makeOrganization(db, reviewer);
    orgId = org.id;
    employer = await makeUser(db, "employer", { organizationId: org.id, inviter: reviewer });
  });

  it("keeps unapproved jobs off the public site through the whole review", async () => {
    const input = jobInput({ title: "Lifecycle Baker Alpha" });
    const job = await createJob(db, employer, input);
    expect(job.status).toBe("draft");
    expect(await getPublicJob(db, job.publicId)).toBeNull();

    await submitJob(db, employer, job.id);
    expect(await getPublicJob(db, job.publicId)).toBeNull();

    const returned = await requestJobChanges(db, reviewer, job.id, "Add the barangay.");
    expect(returned.status).toBe("changes_requested");
    expect(await getPublicJob(db, job.publicId)).toBeNull();

    // Editing a returned listing moves it back to draft (plan: changes requested → draft → pending).
    const edited = await updateJob(
      db,
      employer,
      job.id,
      jobInput({ title: "Lifecycle Baker Alpha", workBarangay: "Poblacion" }),
    );
    expect(edited.status).toBe("draft");
    await submitJob(db, employer, job.id);

    const published = await approveJob(db, reviewer, job.id);
    expect(published.status).toBe("published");
    expect(published.lastConfirmedById).toBe(reviewer.id);
    const pub = await getPublicJob(db, job.publicId);
    expect(pub?.state).toBe("open");
    expect(await search("Lifecycle Baker Alpha")).toContain("Lifecycle Baker Alpha");
  });

  it("can publish without marking the vacancy as confirmed open (imports)", async () => {
    const job = await createJob(db, reviewer, jobInput({ title: "Lifecycle Imported Clerk" }), {
      organizationId: orgId,
    });
    const published = await approveJob(db, reviewer, job.id, "Imported", new Date(), {
      confirmedOpen: false,
    });
    expect(published.status).toBe("published");
    expect(published.lastConfirmedAt).toBeNull();
    expect(published.lastConfirmedById).toBeNull();
  });

  it("never exposes internal contact fields on public job data", async () => {
    const job = await createJob(
      db,
      reviewer,
      jobInput({
        contactEmail: "hr@example.test",
        contactPhone: "0917 000 0000",
        sourceReference: "Email",
      }),
      { organizationId: orgId },
    );
    await approveJob(db, reviewer, job.id);
    const pub = await getPublicJob(db, job.publicId);
    expect(pub?.job).not.toHaveProperty("contactEmail");
    expect(pub?.job).not.toHaveProperty("contactPhone");
    expect(pub?.job).not.toHaveProperty("sourceReference");
  });

  it("only lets employers edit drafts directly", async () => {
    const job = await createJob(db, employer, jobInput());
    await submitJob(db, employer, job.id);
    await expect(updateJob(db, employer, job.id, jobInput())).rejects.toBeInstanceOf(ConflictError);
    await withdrawSubmission(db, employer, job.id);
    await expect(updateJob(db, employer, job.id, jobInput())).resolves.toBeTruthy();
  });

  it("keeps the approved version live until a revision is approved", async () => {
    const job = await createJob(db, employer, jobInput({ title: "Revision Original Beta" }));
    await submitJob(db, employer, job.id);
    await approveJob(db, reviewer, job.id);

    // Employers cannot edit a live listing in place.
    await expect(
      updateJob(db, employer, job.id, jobInput({ title: "Changed in place" })),
    ).rejects.toBeInstanceOf(ConflictError);

    const revision = await proposeRevision(
      db,
      employer,
      job.id,
      jobInput({ title: "Revision Proposed Beta", salaryMin: "20000", salaryPeriod: "month" }),
      "edit",
    );
    expect(revision.status).toBe("pending_review");
    expect((await getPublicJob(db, job.publicId))?.job.title).toBe("Revision Original Beta");
    expect(await search("Revision Proposed Beta")).toEqual([]);

    const sent = await reviewRevision(
      db,
      reviewer,
      revision.id,
      "request_changes",
      "Confirm the salary.",
    );
    expect(sent.revision.status).toBe("changes_requested");
    expect((await getPublicJob(db, job.publicId))?.job.title).toBe("Revision Original Beta");

    const resubmitted = await proposeRevision(
      db,
      employer,
      job.id,
      jobInput({ title: "Revision Proposed Beta", salaryMin: "20000", salaryPeriod: "month" }),
      "edit",
    );
    expect(resubmitted.id).toBe(revision.id);
    await reviewRevision(db, reviewer, revision.id, "approve", null);
    const live = await getPublicJob(db, job.publicId);
    expect(live?.job.title).toBe("Revision Proposed Beta");
    expect(live?.job.salaryMin).toBe(20000);
  });

  it("rejecting a revision leaves the live listing unchanged", async () => {
    const job = await createJob(db, employer, jobInput({ title: "Reject Revision Gamma" }));
    await submitJob(db, employer, job.id);
    await approveJob(db, reviewer, job.id);
    const revision = await proposeRevision(
      db,
      employer,
      job.id,
      jobInput({ title: "Bad change" }),
      "edit",
    );
    await expect(reviewRevision(db, reviewer, revision.id, "reject", null)).rejects.toThrow(
      /reason/i,
    );
    await reviewRevision(db, reviewer, revision.id, "reject", "Not accurate.");
    expect((await getPublicJob(db, job.publicId))?.job.title).toBe("Reject Revision Gamma");
  });

  it("closing a job removes it from search and disables applying", async () => {
    const job = await createJob(db, employer, jobInput({ title: "Closing Delta Role" }));
    await submitJob(db, employer, job.id);
    await approveJob(db, reviewer, job.id);
    await closeJob(db, employer, job.id, "filled");
    expect(await search("Closing Delta Role")).toEqual([]);
    const pub = await getPublicJob(db, job.publicId);
    expect(pub?.state).toBe("closed"); // URL preserved with a closed notice
  });

  it("hides jobs past their deadline even before the expiry sweep runs", async () => {
    const job = await createJob(db, employer, jobInput({ title: "Deadline Epsilon Role" }));
    await submitJob(db, employer, job.id);
    await approveJob(db, reviewer, job.id);
    await db
      .update(jobs)
      .set({ deadlineAt: endOfManilaDay(addDaysToDateString(manilaDateString(), -1)) })
      .where(eq(jobs.id, job.id));

    expect(await search("Deadline Epsilon Role")).toEqual([]);
    expect((await getPublicJob(db, job.publicId))?.state).toBe("expired");

    const expired = await expireDueJobs(db);
    expect(expired.map((j) => j.id)).toContain(job.id);
    const [row] = await db.select().from(jobs).where(eq(jobs.id, job.id));
    expect(row.status).toBe("expired");
    const events = await db
      .select()
      .from(jobEvents)
      .where(and(eq(jobEvents.jobId, job.id), eq(jobEvents.type, "expired")));
    expect(events).toHaveLength(1);
  });

  it("requires confirmation and review to reopen an expired job", async () => {
    const job = await createJob(db, employer, jobInput({ title: "Reopen Zeta Role" }));
    await submitJob(db, employer, job.id);
    await approveJob(db, reviewer, job.id);
    await db
      .update(jobs)
      .set({ deadlineAt: new Date(Date.now() - 1000) })
      .where(eq(jobs.id, job.id));
    await expireDueJobs(db);

    const revision = await proposeRevision(
      db,
      employer,
      job.id,
      jobInput({ title: "Reopen Zeta Role" }),
      "reopen",
    );
    expect((await getPublicJob(db, job.publicId))?.state).toBe("expired");
    await reviewRevision(db, reviewer, revision.id, "approve", null);
    expect((await getPublicJob(db, job.publicId))?.state).toBe("open");
  });

  it("lets staff renew and reopen after confirming", async () => {
    const job = await createJob(db, reviewer, jobInput({ title: "Renew Eta Role" }), {
      organizationId: orgId,
    });
    await approveJob(db, reviewer, job.id);
    await closeJob(db, reviewer, job.id, "no_longer_hiring");
    const reopened = await renewJob(
      db,
      reviewer,
      job.id,
      endOfManilaDay(addDaysToDateString(manilaDateString(), 10)),
    );
    expect(reopened.status).toBe("published");
    expect(reopened.closedAt).toBeNull();
    await expect(
      renewJob(db, reviewer, job.id, new Date(Date.now() - 1000)),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("pauses a reported listing immediately and can resume it", async () => {
    const job = await createJob(db, reviewer, jobInput({ title: "Paused Theta Role" }), {
      organizationId: orgId,
    });
    await approveJob(db, reviewer, job.id);
    await pauseJob(db, reviewer, job.id, "Investigating a fee report");
    expect(await search("Paused Theta Role")).toEqual([]);
    expect((await getPublicJob(db, job.publicId))?.state).toBe("paused");
    await resumeJob(db, reviewer, job.id);
    expect(await search("Paused Theta Role")).toContain("Paused Theta Role");
  });

  it("suspending an employer pauses its live listings and blocks submissions", async () => {
    const org = await makeOrganization(db, reviewer);
    const member = await makeUser(db, "employer", { organizationId: org.id, inviter: reviewer });
    const live = await createJob(db, member, jobInput({ title: "Suspended Iota Role" }));
    await submitJob(db, member, live.id);
    await approveJob(db, reviewer, live.id);
    const draft = await createJob(db, member, jobInput());

    const { pausedJobs } = await setOrganizationVerification(
      db,
      reviewer,
      org.id,
      "suspended",
      "Fee complaints",
    );
    expect(pausedJobs.map((j) => j.id)).toContain(live.id);
    expect(await search("Suspended Iota Role")).toEqual([]);
    await expect(submitJob(db, member, draft.id)).rejects.toBeInstanceOf(ConflictError);
    await expect(resumeJob(db, reviewer, live.id)).rejects.toBeInstanceOf(ConflictError);
  });

  it("does not approve a job whose deadline has passed", async () => {
    const job = await createJob(db, reviewer, jobInput(), { organizationId: orgId });
    await db
      .update(jobs)
      .set({ deadlineAt: new Date(Date.now() - 1000) })
      .where(eq(jobs.id, job.id));
    await expect(approveJob(db, reviewer, job.id)).rejects.toBeInstanceOf(ConflictError);
  });

  it("rejects, archives and blocks invalid transitions", async () => {
    const job = await createJob(db, employer, jobInput());
    await submitJob(db, employer, job.id);
    await rejectJob(db, reviewer, job.id, "Duplicate listing");
    await expect(approveJob(db, reviewer, job.id)).rejects.toBeInstanceOf(ConflictError);
    await expect(submitJob(db, employer, job.id)).rejects.toBeInstanceOf(ConflictError);
    const archived = await archiveJob(db, reviewer, job.id);
    expect(archived.status).toBe("archived");
  });

  it("records an audit trail for approval, edits and closure", async () => {
    const job = await createJob(db, reviewer, jobInput({ title: "Audit Kappa Role" }), {
      organizationId: orgId,
    });
    await approveJob(db, reviewer, job.id);
    await updateJob(db, reviewer, job.id, jobInput({ title: "Audit Kappa Role", openings: "3" }));
    await closeJob(db, reviewer, job.id, "filled");
    const audit = await db.select().from(auditEvents).where(eq(auditEvents.entityId, job.id));
    const actions = audit.map((a) => a.action);
    expect(actions).toEqual(
      expect.arrayContaining(["job.create", "job.approve", "job.edit", "job.close"]),
    );
    expect(audit.every((a) => a.actorId === reviewer.id)).toBe(true);
    const edit = audit.find((a) => a.action === "job.edit");
    expect(edit?.metadata).toMatchObject({ changed: ["openings"] });

    const detail = await getJobForActor(db, reviewer, job.id);
    expect(detail.events.map((e) => e.type)).toEqual(
      expect.arrayContaining(["created", "approved", "edited", "closed"]),
    );
  });
});

describe("public search filters", () => {
  it("parses unknown filter values leniently", () => {
    const f = parsePublicFilters(
      new URLSearchParams({ type: "nonsense", education: "high_school", page: "-4" }),
    );
    expect(f.type).toBe("");
    expect(f.education).toBe("high_school");
    expect(f.page).toBe(1);
  });
});
