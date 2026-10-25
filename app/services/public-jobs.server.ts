import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  ilike,
  inArray,
  isNotNull,
  ne,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import type { Database } from "~/db/client.server";
import { jobMetricsDaily, jobs, organizations } from "~/db/schema";
import {
  EDUCATION_LEVELS,
  EMPLOYMENT_TYPES,
  EXPERIENCE_LEVELS,
  ORGANIZATION_TYPES,
  WORK_SETUPS,
} from "~/lib/labels";
import { manilaDateString } from "~/lib/time";
import { PUBLICLY_VISIBLE_STATUSES } from "./jobs.server";

export const PAGE_SIZE = 20;

export interface PublicJobFilters {
  q: string;
  city: string;
  type: keyof typeof EMPLOYMENT_TYPES | "";
  setup: keyof typeof WORK_SETUPS | "";
  education: keyof typeof EDUCATION_LEVELS | "";
  experience: keyof typeof EXPERIENCE_LEVELS | "";
  employer: keyof typeof ORGANIZATION_TYPES | "";
  sort: "newest" | "deadline";
  page: number;
}

function pick<T extends Record<string, string>>(map: T, value: string | null): keyof T | "" {
  return value && Object.hasOwn(map, value) ? (value as keyof T) : "";
}

/** Parse search params leniently: unknown values are ignored, never errors. */
export function parsePublicFilters(params: URLSearchParams): PublicJobFilters {
  const page = Number.parseInt(params.get("page") ?? "1", 10);
  return {
    q: (params.get("q") ?? "").trim().slice(0, 100),
    city: (params.get("city") ?? "").trim().slice(0, 80),
    type: pick(EMPLOYMENT_TYPES, params.get("type")),
    setup: pick(WORK_SETUPS, params.get("setup")),
    education: pick(EDUCATION_LEVELS, params.get("education")),
    experience: pick(EXPERIENCE_LEVELS, params.get("experience")),
    employer: pick(ORGANIZATION_TYPES, params.get("employer")),
    sort: params.get("sort") === "deadline" ? "deadline" : "newest",
    page: Number.isFinite(page) && page > 0 ? Math.min(page, 500) : 1,
  };
}

/** Prefix query for the `simple` text-search configuration: "cash serv" → "cash:* & serv:*". */
export function toPrefixTsQuery(q: string): string | null {
  const tokens = q
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .slice(0, 8);
  return tokens.length ? tokens.map((t) => `${t}:*`).join(" & ") : null;
}

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** Conditions every publicly listed (actionable) job must meet. */
function activeConditions(now: Date): SQL[] {
  return [
    eq(jobs.status, "published"),
    gt(jobs.deadlineAt, now),
    ne(organizations.verificationStatus, "suspended"),
  ];
}

const cardColumns = {
  id: jobs.id,
  publicId: jobs.publicId,
  slug: jobs.slug,
  title: jobs.title,
  hiringCompanyName: jobs.hiringCompanyName,
  employmentType: jobs.employmentType,
  workSetup: jobs.workSetup,
  workCity: jobs.workCity,
  workBarangay: jobs.workBarangay,
  salaryMin: jobs.salaryMin,
  salaryMax: jobs.salaryMax,
  salaryCurrency: jobs.salaryCurrency,
  salaryPeriod: jobs.salaryPeriod,
  educationLevel: jobs.educationLevel,
  fieldOfStudy: jobs.fieldOfStudy,
  experienceLevel: jobs.experienceLevel,
  openings: jobs.openings,
  deadlineAt: jobs.deadlineAt,
  publishedAt: jobs.publishedAt,
  lastConfirmedAt: jobs.lastConfirmedAt,
  organizationName: organizations.name,
  organizationSlug: organizations.slug,
  organizationType: organizations.type,
  organizationVerified: sql<boolean>`${organizations.verificationStatus} = 'verified'`,
};

export async function searchPublicJobs(db: Database, filters: PublicJobFilters, now = new Date()) {
  const conditions = activeConditions(now);

  if (filters.q) {
    const tsquery = toPrefixTsQuery(filters.q);
    const like = `%${escapeLike(filters.q)}%`;
    const textMatch = or(
      tsquery ? sql`${jobs.searchVector} @@ to_tsquery('simple', ${tsquery})` : undefined,
      ilike(organizations.name, like),
      ilike(jobs.title, like),
      ilike(jobs.fieldOfStudy, like),
    );
    if (textMatch) conditions.push(textMatch);
  }
  if (filters.city) conditions.push(sql`lower(${jobs.workCity}) = lower(${filters.city})`);
  if (filters.type) conditions.push(eq(jobs.employmentType, filters.type));
  if (filters.setup) conditions.push(eq(jobs.workSetup, filters.setup));
  if (filters.employer) conditions.push(eq(organizations.type, filters.employer));
  // Enum order runs from lowest to highest requirement: "open to my level or below".
  if (filters.education) {
    conditions.push(sql`${jobs.educationLevel} <= ${filters.education}::education_level`);
  }
  if (filters.experience) {
    conditions.push(sql`${jobs.experienceLevel} <= ${filters.experience}::experience_level`);
  }

  const where = and(...conditions);
  const order =
    filters.sort === "deadline"
      ? [asc(jobs.deadlineAt), desc(jobs.publishedAt)]
      : [desc(jobs.publishedAt), asc(jobs.deadlineAt)];

  // One round trip: the window function returns the total alongside the page.
  const rows = await db
    .select({ ...cardColumns, total: sql<number>`count(*) over ()`.mapWith(Number) })
    .from(jobs)
    .innerJoin(organizations, eq(organizations.id, jobs.organizationId))
    .where(where)
    .orderBy(...order)
    .limit(PAGE_SIZE)
    .offset((filters.page - 1) * PAGE_SIZE);

  let total = rows[0]?.total ?? 0;
  if (rows.length === 0 && filters.page > 1) {
    // Past the last page: count separately so pagination can still be shown.
    [{ total }] = await db
      .select({ total: count() })
      .from(jobs)
      .innerJoin(organizations, eq(organizations.id, jobs.organizationId))
      .where(where);
  }

  return {
    jobs: rows.map(({ total: _total, ...job }) => job),
    total,
    page: filters.page,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
}

export type PublicJobCard = Awaited<ReturnType<typeof searchPublicJobs>>["jobs"][number];

/** Cities that currently have open jobs, for the location filter. */
export async function listActiveCities(db: Database, now = new Date()) {
  return db
    .select({ city: jobs.workCity, total: count() })
    .from(jobs)
    .innerJoin(organizations, eq(organizations.id, jobs.organizationId))
    .where(and(...activeConditions(now)))
    .groupBy(jobs.workCity)
    .orderBy(desc(count()), asc(jobs.workCity));
}

export type PublicJobState = "open" | "paused" | "closed" | "expired";

export async function getPublicJob(db: Database, publicId: string, now = new Date()) {
  if (!/^[a-z0-9]{4,16}$/.test(publicId)) return null;
  const [row] = await db
    .select({
      job: jobs,
      organization: {
        id: organizations.id,
        name: organizations.name,
        slug: organizations.slug,
        type: organizations.type,
        verificationStatus: organizations.verificationStatus,
        description: organizations.description,
        website: organizations.website,
        officeCity: organizations.officeCity,
      },
    })
    .from(jobs)
    .innerJoin(organizations, eq(organizations.id, jobs.organizationId))
    .where(
      and(
        eq(jobs.publicId, publicId),
        inArray(jobs.status, PUBLICLY_VISIBLE_STATUSES),
        isNotNull(jobs.firstPublishedAt),
      ),
    )
    .limit(1);
  if (!row) return null;

  const { job, organization } = row;
  let state: PublicJobState;
  if (job.status === "published" && organization.verificationStatus !== "suspended") {
    state = job.deadlineAt.getTime() > now.getTime() ? "open" : "expired";
  } else if (job.status === "paused" || job.status === "published") {
    state = "paused";
  } else if (job.status === "expired") {
    state = "expired";
  } else {
    state = "closed";
  }

  // Internal fields never leave the server for public pages.
  const {
    sourceReference: _s,
    contactName: _cn,
    contactEmail: _ce,
    contactPhone: _cp,
    createdById: _c,
    updatedById: _u,
    lastConfirmedById: _l,
    searchVector: _v,
    ...publicJob
  } = job;
  return { job: publicJob, organization, state };
}

export type PublicJob = NonNullable<Awaited<ReturnType<typeof getPublicJob>>>;

export async function getPublicOrganization(db: Database, slug: string, now = new Date()) {
  const [org] = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      slug: organizations.slug,
      type: organizations.type,
      verificationStatus: organizations.verificationStatus,
      verifiedAt: organizations.verifiedAt,
      description: organizations.description,
      website: organizations.website,
      publicEmail: organizations.publicEmail,
      publicPhone: organizations.publicPhone,
      officeCity: organizations.officeCity,
      officeBarangay: organizations.officeBarangay,
      officeAddress: organizations.officeAddress,
    })
    .from(organizations)
    .where(and(eq(organizations.slug, slug), ne(organizations.verificationStatus, "suspended")))
    .limit(1);
  if (!org) return null;

  const openJobs = await db
    .select(cardColumns)
    .from(jobs)
    .innerJoin(organizations, eq(organizations.id, jobs.organizationId))
    .where(and(eq(jobs.organizationId, org.id), ...activeConditions(now)))
    .orderBy(desc(jobs.publishedAt))
    .limit(50);

  // Profiles are public once verified, or while the organization has open listings.
  if (org.verificationStatus !== "verified" && openJobs.length === 0) return null;
  return { organization: org, jobs: openJobs };
}

/** Public sitemap entries for open jobs. */
export async function listSitemapJobs(db: Database, now = new Date()) {
  return db
    .select({ publicId: jobs.publicId, slug: jobs.slug, updatedAt: jobs.updatedAt })
    .from(jobs)
    .innerJoin(organizations, eq(organizations.id, jobs.organizationId))
    .where(and(...activeConditions(now)))
    .orderBy(desc(jobs.publishedAt))
    .limit(5000);
}

/** Increment a daily aggregate. One row per job per Manila day; no visitor data. */
export async function recordJobMetric(
  db: Database,
  jobId: string,
  metric: "views" | "applyClicks",
  now = new Date(),
) {
  const day = manilaDateString(now);
  const column = metric === "views" ? jobMetricsDaily.views : jobMetricsDaily.applyClicks;
  await db
    .insert(jobMetricsDaily)
    .values({
      jobId,
      day,
      views: metric === "views" ? 1 : 0,
      applyClicks: metric === "applyClicks" ? 1 : 0,
    })
    .onConflictDoUpdate({
      target: [jobMetricsDaily.jobId, jobMetricsDaily.day],
      set: { [metric]: sql`${column} + 1` },
    });
}
