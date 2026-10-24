import { eq } from "drizzle-orm";
import { beforeAll, expect, it } from "vitest";
import { applications, auditEvents } from "~/db/schema";
import type { ResumeStore } from "~/lib/resume";
import { applicationInputSchema } from "~/lib/validation";
import {
  countNewApplications,
  getApplication,
  listApplications,
  openResume,
  purgeExpiredApplications,
  submitApplication,
  updateApplicationStatus,
} from "~/services/applications.server";
import { ConflictError, InputError, NotFoundError, type Actor } from "~/services/common.server";
import { approveJob, closeJob, createJob } from "~/services/jobs.server";
import { describeDb, testDb } from "../helpers/db";
import { admin, jobInput, makeOrganization, makeUser } from "../helpers/factories";

/** In-memory stand-in for the R2 bucket. */
function memoryStore() {
  const files = new Map<string, Uint8Array>();
  const store: ResumeStore = {
    async put(key, body) {
      files.set(key, body);
    },
    async get(key) {
      const body = files.get(key);
      return body
        ? { body: new Blob([new Uint8Array(body)]).stream(), size: body.byteLength }
        : null;
    },
    async delete(keys) {
      for (const k of keys) files.delete(k);
    },
  };
  return { store, files };
}

const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x0a]);
const applicant = applicationInputSchema.parse({
  fullName: "Test Applicant",
  email: "applicant@example.test",
  consent: "on",
});

describeDb("applications with résumés", () => {
  const db = testDb();
  const { store, files } = memoryStore();
  let reviewer: Actor;
  let employerA: Actor;
  let employerB: Actor;
  let openJob: { id: string; publicId: string };
  let externalJob: { publicId: string };

  async function publish(organizationId: string, overrides: Record<string, unknown>) {
    const job = await createJob(db, reviewer, jobInput(overrides), { organizationId });
    return approveJob(db, reviewer, job.id);
  }

  beforeAll(async () => {
    reviewer = await makeUser(db, "reviewer", { inviter: await admin(db) });
    const orgA = await makeOrganization(db, reviewer);
    const orgB = await makeOrganization(db, reviewer);
    employerA = await makeUser(db, "employer", { organizationId: orgA.id, inviter: reviewer });
    employerB = await makeUser(db, "employer", { organizationId: orgB.id, inviter: reviewer });
    openJob = await publish(orgA.id, { acceptsApplications: "on" });
    externalJob = await publish(orgA.id, { applicationUrl: "https://example.com/apply" });
  });

  it("does not accept applications unless the job takes them here", () => {
    expect(jobInput({ acceptsApplications: "on" }).acceptsApplications).toBe(true);
    expect(jobInput().acceptsApplications).toBe(false);
    return expect(
      submitApplication(db, store, externalJob.publicId, applicant, {
        bytes: PDF,
        filename: "cv.pdf",
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("rejects files that are not PDF or Word and stores nothing", async () => {
    const before = files.size;
    await expect(
      submitApplication(db, store, openJob.publicId, applicant, {
        bytes: new TextEncoder().encode("MZ fake executable"),
        filename: "cv.pdf",
      }),
    ).rejects.toBeInstanceOf(InputError);
    expect(files.size).toBe(before);
  });

  it("stores the résumé privately and records the application", async () => {
    const { reference } = await submitApplication(db, store, openJob.publicId, applicant, {
      bytes: PDF,
      filename: "Test CV.pdf",
    });
    expect(reference).toMatch(/^TB-[0-9A-Z]{6}$/);
    const [row] = await db.select().from(applications).where(eq(applications.reference, reference));
    expect(row.status).toBe("submitted");
    expect(row.resumeKey).toMatch(new RegExp(`^applications/${openJob.id}/`));
    expect(files.has(row.resumeKey)).toBe(true);
  });

  it("shows applications only to the job's organization and to staff", async () => {
    const [mine] = await listApplications(db, employerA);
    expect(mine.jobId).toBe(openJob.id);
    expect(await listApplications(db, employerB)).toHaveLength(0);
    expect((await listApplications(db, reviewer)).some((a) => a.id === mine.id)).toBe(true);

    await expect(getApplication(db, employerB, mine.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(openResume(db, store, employerB, mine.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(updateApplicationStatus(db, employerB, mine.id, "hired")).rejects.toBeInstanceOf(
      NotFoundError,
    );
    expect(await countNewApplications(db, employerB)).toBe(0);
    expect(await countNewApplications(db, employerA)).toBeGreaterThan(0);
  });

  it("records résumé downloads and status changes", async () => {
    const [mine] = await listApplications(db, employerA);
    const file = await openResume(db, store, employerA, mine.id);
    expect(file.contentType).toBe("application/pdf");
    expect(file.filename).toBe("Test CV.pdf");
    const updated = await updateApplicationStatus(db, employerA, mine.id, "shortlisted");
    expect(updated.status).toBe("shortlisted");
    expect(updated.statusUpdatedById).toBe(employerA.id);
    const audit = await db
      .select({ action: auditEvents.action })
      .from(auditEvents)
      .where(eq(auditEvents.entityId, mine.id));
    expect(audit.map((a) => a.action).sort()).toEqual([
      "application.resume_download",
      "application.status",
    ]);
  });

  it("stops accepting applications when the job closes", async () => {
    await closeJob(db, employerA, openJob.id, "filled");
    await expect(
      submitApplication(db, store, openJob.publicId, applicant, { bytes: PDF, filename: "a.pdf" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("deletes applications and résumés after the retention period", async () => {
    const [mine] = await listApplications(db, employerA);
    const { application } = await getApplication(db, employerA, mine.id);
    const later = new Date(application.createdAt.getTime() + 181 * 86_400_000);
    expect(await purgeExpiredApplications(db, store, later)).toBeGreaterThan(0);
    expect(files.has(application.resumeKey)).toBe(false);
    await expect(getApplication(db, reviewer, mine.id)).rejects.toBeInstanceOf(NotFoundError);
  });
});
