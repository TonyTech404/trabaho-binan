import { and, eq } from "drizzle-orm";
import { beforeAll, expect, it } from "vitest";
import { applicationFiles, applications, auditEvents, jobs } from "~/db/schema";
import type { ResumeStore } from "~/lib/resume";
import { applicationInputSchema } from "~/lib/validation";
import {
  closeFilledJob,
  countHires,
  countNewApplications,
  getApplication,
  listApplications,
  lookupApplicationStatus,
  openApplicationFile,
  purgeExpiredApplications,
  submitApplication,
  updateApplicationStatus,
} from "~/services/applications.server";
import {
  ConflictError,
  ForbiddenError,
  InputError,
  NotFoundError,
  type Actor,
} from "~/services/common.server";
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
const text = (s: string) => [...s].map((c) => c.charCodeAt(0));
/** A phone photo: JPEG with an EXIF block that mentions a GPS position. */
const PHOTO = new Uint8Array([
  0xff,
  0xd8,
  0xff,
  0xe1,
  0x00,
  0x16,
  ...text("Exif\0\0GPS 14.33N 121"),
  0xff,
  0xda,
  0x00,
  0x08,
  0x01,
  0x01,
  0x00,
  0x00,
  0x3f,
  0x00,
  0x11,
  0x22,
  0xff,
  0xd9,
]);

const applicant = (overrides: Record<string, unknown> = {}) =>
  applicationInputSchema.parse({
    fullName: "Test Applicant",
    phone: "0917 123 4567",
    consent: "on",
    ...overrides,
  });

describeDb("applications", () => {
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
  const byRef = async (reference: string) =>
    (await db.select().from(applications).where(eq(applications.reference, reference)))[0];

  beforeAll(async () => {
    reviewer = await makeUser(db, "reviewer", { inviter: await admin(db) });
    const orgA = await makeOrganization(db, reviewer);
    const orgB = await makeOrganization(db, reviewer);
    employerA = await makeUser(db, "employer", { organizationId: orgA.id, inviter: reviewer });
    employerB = await makeUser(db, "employer", { organizationId: orgB.id, inviter: reviewer });
    openJob = await publish(orgA.id, { acceptsApplications: "on", openings: "2" });
    externalJob = await publish(orgA.id, { applicationUrl: "https://example.com/apply" });
  });

  it("does not accept applications unless the job takes them here", () => {
    expect(jobInput({ acceptsApplications: "on" }).acceptsApplications).toBe(true);
    expect(jobInput().acceptsApplications).toBe(false);
    return expect(
      submitApplication(db, store, externalJob.publicId, applicant()),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("accepts an application with no files at all", async () => {
    const { reference } = await submitApplication(
      db,
      store,
      openJob.publicId,
      applicant({ fullName: "No CV Applicant", experience: "Two years as a kitchen helper." }),
    );
    const row = await byRef(reference);
    expect(row.phone).toBe("+639171234567");
    expect(row.experience).toBe("Two years as a kitchen helper.");
    const attached = await db
      .select()
      .from(applicationFiles)
      .where(eq(applicationFiles.applicationId, row.id));
    expect(attached).toHaveLength(0);
  });

  it("stores a résumé and photos privately, without the photo's location data", async () => {
    const { reference } = await submitApplication(db, store, openJob.publicId, applicant(), [
      { bytes: PDF, filename: "Test CV.pdf" },
      { bytes: PHOTO, filename: "IMG_2041.jpg" },
    ]);
    expect(reference).toMatch(/^TB-[0-9A-Z]{6}$/);
    const row = await byRef(reference);
    expect(row.status).toBe("submitted");
    const attached = await db
      .select()
      .from(applicationFiles)
      .where(eq(applicationFiles.applicationId, row.id))
      .orderBy(applicationFiles.position);
    expect(attached.map((f) => f.contentType)).toEqual(["application/pdf", "image/jpeg"]);
    expect(attached[0].key).toMatch(new RegExp(`^applications/${openJob.id}/${row.id}/0$`));
    const storedPhoto = files.get(attached[1].key)!;
    expect(new TextDecoder("latin1").decode(storedPhoto)).not.toContain("GPS");
  });

  it("rejects unsupported files, too many files and oversized sets, storing nothing", async () => {
    const before = files.size;
    await expect(
      submitApplication(db, store, openJob.publicId, applicant(), [
        { bytes: new TextEncoder().encode("MZ fake executable"), filename: "cv.pdf" },
      ]),
    ).rejects.toBeInstanceOf(InputError);
    await expect(
      submitApplication(
        db,
        store,
        openJob.publicId,
        applicant(),
        Array.from({ length: 4 }, (_, i) => ({ bytes: PDF, filename: `${i}.pdf` })),
      ),
    ).rejects.toBeInstanceOf(InputError);
    const big = new Uint8Array(4 * 1024 * 1024);
    big.set(PDF);
    await expect(
      submitApplication(
        db,
        store,
        openJob.publicId,
        applicant(),
        Array.from({ length: 3 }, (_, i) => ({ bytes: big, filename: `${i}.pdf` })),
      ),
    ).rejects.toBeInstanceOf(InputError);
    expect(files.size).toBe(before);
  });

  it("shows applications only to the job's organization and to staff", async () => {
    const mine = await listApplications(db, employerA);
    expect(mine.length).toBeGreaterThan(0);
    expect(mine.every((a) => a.jobId === openJob.id)).toBe(true);
    expect(await listApplications(db, employerB)).toHaveLength(0);
    expect((await listApplications(db, reviewer)).length).toBeGreaterThanOrEqual(mine.length);

    const withFiles = mine.find((a) => a.fileCount > 0)!;
    const { files: attached } = await getApplication(db, employerA, withFiles.id);
    await expect(getApplication(db, employerB, withFiles.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      openApplicationFile(db, store, employerB, withFiles.id, attached[0].id),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      updateApplicationStatus(db, employerB, withFiles.id, "hired"),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(await countNewApplications(db, employerB)).toBe(0);
    expect(await countNewApplications(db, employerA)).toBeGreaterThan(0);
  });

  it("records file access and status changes", async () => {
    const withFiles = (await listApplications(db, employerA)).find((a) => a.fileCount > 0)!;
    const { files: attached } = await getApplication(db, employerA, withFiles.id);
    const file = await openApplicationFile(db, store, employerA, withFiles.id, attached[0].id);
    expect(file.contentType).toBe("application/pdf");
    expect(file.filename).toBe("Test CV.pdf");
    // A file id from another application is not found through this one.
    const other = (await listApplications(db, employerA)).find((a) => a.id !== withFiles.id)!;
    await expect(
      openApplicationFile(db, store, employerA, other.id, attached[0].id),
    ).rejects.toBeInstanceOf(NotFoundError);
    const updated = await updateApplicationStatus(db, employerA, withFiles.id, "shortlisted");
    expect(updated.status).toBe("shortlisted");
    const audit = await db
      .select({ action: auditEvents.action })
      .from(auditEvents)
      .where(eq(auditEvents.entityId, withFiles.id));
    expect(audit.map((a) => a.action).sort()).toEqual([
      "application.file_download",
      "application.status",
    ]);
  });

  it("lets applicants check their status with their reference and phone or email", async () => {
    const { reference } = await submitApplication(
      db,
      store,
      openJob.publicId,
      applicant({
        fullName: "Status Checker",
        phone: "0918 765 4321",
        email: "Check@Example.test",
      }),
    );
    const found = await lookupApplicationStatus(
      db,
      reference.toLowerCase().replace("-", ""),
      "+63 918 765 4321",
    );
    expect(found).toMatchObject({ reference, status: "submitted" });
    expect(found).not.toHaveProperty("phone");
    expect(found).not.toHaveProperty("email");
    expect(await lookupApplicationStatus(db, reference, "check@example.test")).not.toBeNull();
    expect(await lookupApplicationStatus(db, reference, "0917 000 0000")).toBeNull();
    expect(await lookupApplicationStatus(db, "TB-ZZZZZZ", "0918 765 4321")).toBeNull();
  });

  it("after a hire, closes the job and settles the others who are still waiting", async () => {
    const waiting = (await listApplications(db, employerA)).filter((a) => a.status === "submitted");
    const hire = waiting[0];
    await expect(
      closeFilledJob(db, employerA, hire.id, { notifyOthers: true }),
    ).rejects.toBeInstanceOf(ConflictError);
    await updateApplicationStatus(db, employerA, hire.id, "hired");
    const detail = await getApplication(db, employerA, hire.id);
    expect(detail.hires).toBe(1);
    expect(detail.job.openings).toBe(2);
    expect(detail.waiting).toBeGreaterThan(0);

    const { closedJob, settled } = await closeFilledJob(db, employerA, hire.id, {
      notifyOthers: true,
    });
    expect(closedJob?.status).toBe("closed");
    expect(settled).toBe(detail.waiting);
    const stillWaiting = await db
      .select()
      .from(applications)
      .where(and(eq(applications.jobId, openJob.id), eq(applications.status, "submitted")));
    expect(stillWaiting).toHaveLength(0);
    // Shortlisted applicants are settled too; the hire stays hired.
    expect((await byRef(hire.reference)).status).toBe("hired");
    const [job] = await db.select().from(jobs).where(eq(jobs.id, openJob.id));
    expect(job.status).toBe("closed");
    await expect(
      submitApplication(db, store, openJob.publicId, applicant()),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("counts hires for staff only", async () => {
    const hires = await countHires(db, reviewer);
    expect(hires.total).toBeGreaterThanOrEqual(1);
    expect(hires.last30Days).toBeGreaterThanOrEqual(1);
    await expect(countHires(db, employerA)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("stops accepting applications when a job is closed directly", async () => {
    const other = await publish(employerA.organizationId!, { acceptsApplications: "on" });
    await closeJob(db, employerA, other.id, "filled");
    await expect(submitApplication(db, store, other.publicId, applicant())).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("deletes applications and their files after the retention period", async () => {
    const withFiles = (await listApplications(db, reviewer)).find((a) => a.fileCount > 0)!;
    const { application, files: attached } = await getApplication(db, reviewer, withFiles.id);
    const keys = (
      await db
        .select({ key: applicationFiles.key })
        .from(applicationFiles)
        .where(eq(applicationFiles.applicationId, application.id))
    ).map((k) => k.key);
    expect(attached.length).toBe(keys.length);
    const later = new Date(application.createdAt.getTime() + 181 * 86_400_000);
    expect(await purgeExpiredApplications(db, store, later)).toBeGreaterThan(0);
    expect(keys.some((k) => files.has(k))).toBe(false);
    await expect(getApplication(db, reviewer, withFiles.id)).rejects.toBeInstanceOf(NotFoundError);
  });
});
