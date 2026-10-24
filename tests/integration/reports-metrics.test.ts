import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { beforeAll, describe, expect, it } from "vitest";
import { auditEvents, jobMetricsDaily, listingReports } from "~/db/schema";
import { NotFoundError, type Actor } from "~/services/common.server";
import { exportJobs } from "~/services/job-queries.server";
import { approveJob, createJob } from "~/services/jobs.server";
import { recordJobMetric } from "~/services/public-jobs.server";
import { createReport, reportInputSchema, resolveReport } from "~/services/reports.server";
import { describeDb, TEST_DATABASE_URL, testDb } from "../helpers/db";
import { admin, jobInput, makeOrganization, makeUser } from "../helpers/factories";

describeDb("reports, metrics and exports", () => {
  const db = testDb();
  let reviewer: Actor;
  let orgId: string;

  beforeAll(async () => {
    reviewer = await makeUser(db, "reviewer", { inviter: await admin(db) });
    orgId = (await makeOrganization(db, reviewer)).id;
  });

  it("accepts reports only for public listings", async () => {
    const draft = await createJob(db, reviewer, jobInput(), { organizationId: orgId });
    const input = reportInputSchema.parse({
      reason: "scam_or_fee",
      details: "Asked for a fee",
      reporterContact: "",
    });
    await expect(createReport(db, draft.publicId, input)).rejects.toBeInstanceOf(NotFoundError);
    await approveJob(db, reviewer, draft.id);
    await expect(createReport(db, draft.publicId, input)).resolves.toBeTruthy();
  });

  it("erases the reporter's contact details when a report is closed", async () => {
    const job = await createJob(db, reviewer, jobInput(), { organizationId: orgId });
    await approveJob(db, reviewer, job.id);
    const report = await createReport(
      db,
      job.publicId,
      reportInputSchema.parse({
        reason: "incorrect_information",
        details: "Wrong pay",
        reporterContact: "0917 000 0000",
      }),
    );
    await resolveReport(db, reviewer, report.id, "resolved", "Employer corrected the pay.");
    const [row] = await db.select().from(listingReports).where(eq(listingReports.id, report.id));
    expect(row.status).toBe("resolved");
    expect(row.reporterContact).toBeNull();
    expect(row.resolvedById).toBe(reviewer.id);
  });

  it("validates report input", () => {
    expect(reportInputSchema.safeParse({ reason: "not-a-reason" }).success).toBe(false);
    expect(
      reportInputSchema.safeParse({ reason: "other", details: "x".repeat(2001) }).success,
    ).toBe(false);
  });

  it("aggregates views and apply clicks per job per day", async () => {
    const job = await createJob(db, reviewer, jobInput(), { organizationId: orgId });
    await approveJob(db, reviewer, job.id);
    await recordJobMetric(db, job.id, "views");
    await recordJobMetric(db, job.id, "views");
    await recordJobMetric(db, job.id, "applyClicks");
    const rows = await db.select().from(jobMetricsDaily).where(eq(jobMetricsDaily.jobId, job.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ views: 2, applyClicks: 1 });
  });

  it("exports listing facts without personal contact data", async () => {
    const job = await createJob(db, reviewer, jobInput({ contactEmail: "private@example.test" }), {
      organizationId: orgId,
    });
    await approveJob(db, reviewer, job.id);
    const rows = await exportJobs(db, reviewer);
    expect(rows.length).toBeGreaterThan(0);
    expect(JSON.stringify(rows)).not.toContain("private@example.test");
  });
});

// Runs only when a restricted runtime role is configured (CI sets it up).
const appRoleUrl = process.env.TEST_APP_ROLE_DATABASE_URL;
const describeAppRole = TEST_DATABASE_URL && appRoleUrl ? describe : describe.skip;

describeAppRole("restricted runtime role", () => {
  let pool: pg.Pool;
  beforeAll(() => {
    pool = new pg.Pool({ connectionString: appRoleUrl, max: 1 });
    return () => pool.end();
  });

  it("can read and write rows but cannot change the schema", async () => {
    const appDb = drizzle(pool);
    await expect(appDb.select().from(auditEvents).limit(1)).resolves.toBeDefined();
    await expect(pool.query("create table should_fail (id int)")).rejects.toThrow(
      /permission denied/,
    );
  });

  it("cannot alter or delete audit history", async () => {
    await expect(pool.query("delete from audit_events")).rejects.toThrow(/permission denied/);
    await expect(pool.query("update audit_events set summary = 'x'")).rejects.toThrow(
      /permission denied/,
    );
    await expect(pool.query("delete from job_events")).rejects.toThrow(/permission denied/);
  });
});
