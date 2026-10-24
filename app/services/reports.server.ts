import { and, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "~/db/client.server";
import { jobs, listingReports, organizations, users } from "~/db/schema";
import { REPORT_REASONS } from "~/lib/labels";
import { cleanText, withEmptyDefaults } from "~/lib/validation";
import {
  ConflictError,
  NotFoundError,
  recordAudit,
  requireStaff,
  type Actor,
} from "./common.server";

export const reportInputSchema = withEmptyDefaults(
  z.object({
    reason: z.enum(Object.keys(REPORT_REASONS) as [keyof typeof REPORT_REASONS], {
      error: "Choose what is wrong with this listing.",
    }),
    details: z
      .unknown()
      .transform((v) => cleanText(v) || null)
      .pipe(z.string().max(2000, "Keep the details under 2,000 characters.").nullable()),
    reporterContact: z
      .unknown()
      .transform((v) => cleanText(v) || null)
      .pipe(z.string().max(200, "Keep contact details under 200 characters.").nullable()),
  }),
);
export type ReportInput = z.output<typeof reportInputSchema>;

/** Anyone can report a public listing. No account or personal data is required. */
export async function createReport(db: Database, publicId: string, input: ReportInput) {
  const [job] = await db
    .select({ id: jobs.id, title: jobs.title })
    .from(jobs)
    .where(
      and(
        eq(jobs.publicId, publicId),
        inArray(jobs.status, ["published", "paused", "closed", "expired"]),
        isNotNull(jobs.firstPublishedAt),
      ),
    )
    .limit(1);
  if (!job) throw new NotFoundError("Job not found.");
  const [report] = await db
    .insert(listingReports)
    .values({ jobId: job.id, ...input })
    .returning({ id: listingReports.id });
  return report;
}

export async function listReports(
  db: Database,
  actor: Actor,
  filters: { status?: "open" | "resolved" | "dismissed" | "" } = {},
) {
  requireStaff(actor);
  return db
    .select({
      id: listingReports.id,
      reason: listingReports.reason,
      details: listingReports.details,
      reporterContact: listingReports.reporterContact,
      status: listingReports.status,
      resolutionNote: listingReports.resolutionNote,
      resolvedAt: listingReports.resolvedAt,
      resolvedByName: users.name,
      createdAt: listingReports.createdAt,
      jobId: jobs.id,
      jobTitle: jobs.title,
      jobStatus: jobs.status,
      jobPublicId: jobs.publicId,
      organizationName: organizations.name,
    })
    .from(listingReports)
    .innerJoin(jobs, eq(jobs.id, listingReports.jobId))
    .innerJoin(organizations, eq(organizations.id, jobs.organizationId))
    .leftJoin(users, eq(users.id, listingReports.resolvedById))
    .where(filters.status ? eq(listingReports.status, filters.status) : undefined)
    .orderBy(
      sql`case when ${listingReports.status} = 'open' then 0 else 1 end`,
      desc(listingReports.createdAt),
    )
    .limit(200);
}

export async function listReportsForJob(db: Database, actor: Actor, jobId: string) {
  requireStaff(actor);
  return db
    .select()
    .from(listingReports)
    .where(eq(listingReports.jobId, jobId))
    .orderBy(desc(listingReports.createdAt));
}

export async function resolveReport(
  db: Database,
  actor: Actor,
  reportId: string,
  outcome: "resolved" | "dismissed",
  note: string,
  now = new Date(),
) {
  requireStaff(actor);
  return db.transaction(async (tx) => {
    const [report] = await tx
      .select()
      .from(listingReports)
      .where(eq(listingReports.id, reportId))
      .for("update")
      .limit(1);
    if (!report) throw new NotFoundError("Report not found.");
    if (report.status !== "open") throw new ConflictError("This report has already been handled.");
    const [updated] = await tx
      .update(listingReports)
      .set({ status: outcome, resolutionNote: note, resolvedById: actor.id, resolvedAt: now })
      .where(eq(listingReports.id, reportId))
      .returning();
    await recordAudit(tx, actor, {
      action: `report.${outcome === "resolved" ? "resolve" : "dismiss"}`,
      entityType: "listing_report",
      entityId: report.id,
      summary: note,
      metadata: { jobId: report.jobId, reason: report.reason },
    });
    return updated;
  });
}
