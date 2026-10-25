import { and, asc, count, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import type { Database } from "~/db/client.server";
import {
  accountLinks,
  jobs,
  organizationMembers,
  organizations,
  sessions,
  users,
  type Organization,
} from "~/db/schema";
import { randomId, slugify } from "~/lib/ids";
import type { OrganizationInput, OrganizationProfileInput } from "~/lib/validation";
import {
  ConflictError,
  ForbiddenError,
  isStaff,
  isUuid,
  NotFoundError,
  recordAudit,
  recordJobEvent,
  requireStaff,
  type Actor,
} from "./common.server";

const ORGANIZATION_FIELDS = [
  "name",
  "type",
  "description",
  "website",
  "publicEmail",
  "publicPhone",
  "officeCity",
  "officeBarangay",
  "officeAddress",
  "internalNotes",
] as const satisfies readonly (keyof OrganizationInput)[];

export const PROFILE_FIELDS = [
  "description",
  "website",
  "publicEmail",
  "publicPhone",
  "officeCity",
  "officeBarangay",
  "officeAddress",
] as const satisfies readonly (keyof OrganizationProfileInput)[];

/** Copy only the named fields: verification and identity never come from form input. */
function pickFields<K extends string>(input: Record<string, unknown>, keys: readonly K[]) {
  const out = {} as Record<K, string | null>;
  for (const key of keys) out[key] = (input[key] as string | null | undefined) ?? null;
  return out;
}

async function uniqueSlug(db: Database, name: string) {
  const base = slugify(name, 50);
  const [taken] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.slug, base))
    .limit(1);
  return taken ? `${base}-${randomId(4)}` : base;
}

export async function createOrganization(db: Database, actor: Actor, input: OrganizationInput) {
  requireStaff(actor);
  const slug = await uniqueSlug(db, input.name);
  return db.transaction(async (tx) => {
    const [org] = await tx
      .insert(organizations)
      .values({
        ...(pickFields(input, ORGANIZATION_FIELDS) as OrganizationInput),
        slug,
        createdById: actor.id,
      })
      .returning();
    await recordAudit(tx, actor, {
      action: "organization.create",
      entityType: "organization",
      entityId: org.id,
      summary: org.name,
    });
    return org;
  });
}

export async function updateOrganization(
  db: Database,
  actor: Actor,
  organizationId: string,
  input: OrganizationInput,
) {
  requireStaff(actor);
  if (!isUuid(organizationId)) throw new NotFoundError("Organization not found.");
  return db.transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .for("update")
      .limit(1);
    if (!before) throw new NotFoundError("Organization not found.");
    const values = pickFields(input, ORGANIZATION_FIELDS) as OrganizationInput;
    const [org] = await tx
      .update(organizations)
      .set(values)
      .where(eq(organizations.id, organizationId))
      .returning();
    const changed = ORGANIZATION_FIELDS.filter((k) => (before[k] ?? null) !== (values[k] ?? null));
    await recordAudit(tx, actor, {
      action: "organization.edit",
      entityType: "organization",
      entityId: org.id,
      summary: org.name,
      metadata: { changed },
    });
    return org;
  });
}

/**
 * Employers propose changes to their own public profile; name and type stay
 * with staff. The profile appears on every job page, so nothing goes public
 * until a reviewer approves it (reviewProfileChange).
 */
export async function updateOwnOrganizationProfile(
  db: Database,
  actor: Actor,
  input: OrganizationProfileInput,
  now = new Date(),
) {
  if (actor.role !== "employer" || !actor.organizationId) throw new ForbiddenError();
  const organizationId = actor.organizationId;
  return db.transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .for("update")
      .limit(1);
    if (!before) throw new NotFoundError("Organization not found.");
    if (before.verificationStatus === "suspended") throw new ForbiddenError();
    const proposed = pickFields(input, PROFILE_FIELDS);
    const changed = PROFILE_FIELDS.filter((k) => (before[k] ?? null) !== proposed[k]);
    // Saving the approved details again withdraws a pending proposal.
    const [org] = await tx
      .update(organizations)
      .set(
        changed.length
          ? { pendingProfile: proposed, pendingProfileSubmittedAt: now, profileReviewNote: null }
          : { pendingProfile: null, pendingProfileSubmittedAt: null },
      )
      .where(eq(organizations.id, organizationId))
      .returning();
    await recordAudit(tx, actor, {
      action: changed.length ? "organization.profile_submit" : "organization.profile_withdraw",
      entityType: "organization",
      entityId: org.id,
      summary: org.name,
      metadata: { changed },
    });
    return { organization: org, submitted: changed.length > 0 };
  });
}

/**
 * Staff approve or reject an employer's proposed profile. `submittedAt` is the
 * proposal the reviewer looked at; if the employer has changed it since, the
 * decision is refused so nobody approves text they have not seen.
 */
export async function reviewProfileChange(
  db: Database,
  actor: Actor,
  organizationId: string,
  decision: "approve" | "reject",
  options: { submittedAt: string; note: string | null },
) {
  requireStaff(actor);
  if (!isUuid(organizationId)) throw new NotFoundError("Organization not found.");
  if (decision === "reject" && !options.note) throw new ConflictError("Give a reason.");
  return db.transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .for("update")
      .limit(1);
    if (!before) throw new NotFoundError("Organization not found.");
    if (!before.pendingProfile || !before.pendingProfileSubmittedAt) {
      throw new ConflictError("No profile changes are waiting for review.");
    }
    if (before.pendingProfileSubmittedAt.toISOString() !== options.submittedAt) {
      throw new ConflictError("The employer changed the proposal. Check it again before deciding.");
    }
    const proposed = pickFields(before.pendingProfile, PROFILE_FIELDS);
    const changed = PROFILE_FIELDS.filter((k) => (before[k] ?? null) !== proposed[k]);
    const [org] = await tx
      .update(organizations)
      .set({
        ...(decision === "approve" ? proposed : {}),
        pendingProfile: null,
        pendingProfileSubmittedAt: null,
        profileReviewNote: decision === "reject" ? options.note : null,
      })
      .where(eq(organizations.id, organizationId))
      .returning();
    await recordAudit(tx, actor, {
      action: `organization.profile_${decision}`,
      entityType: "organization",
      entityId: org.id,
      summary: org.name,
      metadata: { changed, note: options.note },
    });
    // Job pages show the profile, so their cached copies need refreshing.
    const liveJobs =
      decision === "approve"
        ? await tx
            .select({ publicId: jobs.publicId, slug: jobs.slug })
            .from(jobs)
            .where(
              and(eq(jobs.organizationId, org.id), inArray(jobs.status, ["published", "paused"])),
            )
        : [];
    return { organization: org, liveJobs };
  });
}

/**
 * Verification is separate from vacancy approval: it records that an
 * authorised reviewer completed the agreed checks on the organization.
 * Only staff can verify; employers can never verify themselves.
 */
export async function setOrganizationVerification(
  db: Database,
  actor: Actor,
  organizationId: string,
  status: "verified" | "unverified" | "suspended",
  note: string | null,
  now = new Date(),
) {
  requireStaff(actor);
  if (!isUuid(organizationId)) throw new NotFoundError("Organization not found.");
  return db.transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .for("update")
      .limit(1);
    if (!before) throw new NotFoundError("Organization not found.");
    if (before.verificationStatus === status) return { organization: before, pausedJobs: [] };

    const [org] = await tx
      .update(organizations)
      .set({
        verificationStatus: status,
        verifiedAt: status === "verified" ? now : null,
        verifiedById: status === "verified" ? actor.id : null,
      })
      .where(eq(organizations.id, organizationId))
      .returning();

    // Suspension takes the organization's live listings down immediately and
    // cuts off its people: sessions end and unused invitations stop working.
    let pausedJobs: { id: string; publicId: string; slug: string }[] = [];
    if (status === "suspended") {
      const members = tx
        .select({ id: organizationMembers.userId })
        .from(organizationMembers)
        .where(eq(organizationMembers.organizationId, organizationId));
      await tx.delete(sessions).where(inArray(sessions.userId, members));
      await tx
        .update(accountLinks)
        .set({ revokedAt: now })
        .where(
          and(
            eq(accountLinks.organizationId, organizationId),
            isNull(accountLinks.usedAt),
            isNull(accountLinks.revokedAt),
          ),
        );
      pausedJobs = await tx
        .update(jobs)
        .set({ status: "paused", pausedAt: now, updatedById: actor.id })
        .where(and(eq(jobs.organizationId, organizationId), eq(jobs.status, "published")))
        .returning({ id: jobs.id, publicId: jobs.publicId, slug: jobs.slug });
      for (const job of pausedJobs) {
        await recordJobEvent(tx, actor, {
          jobId: job.id,
          type: "paused",
          note: "Employer suspended",
        });
      }
    }
    await recordAudit(tx, actor, {
      action: `organization.${status === "verified" ? "verify" : status === "suspended" ? "suspend" : "unverify"}`,
      entityType: "organization",
      entityId: org.id,
      summary: org.name,
      metadata: {
        from: before.verificationStatus,
        to: status,
        note,
        pausedJobs: pausedJobs.length,
      },
    });
    return { organization: org, pausedJobs };
  });
}

export async function getOrganizationForActor(db: Database, actor: Actor, organizationId: string) {
  if (!isUuid(organizationId)) throw new NotFoundError("Organization not found.");
  if (!isStaff(actor) && actor.organizationId !== organizationId) {
    throw new NotFoundError("Organization not found.");
  }
  const [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);
  if (!org) throw new NotFoundError("Organization not found.");
  return org;
}

export async function listOrganizations(
  db: Database,
  actor: Actor,
  filters: { q?: string; status?: Organization["verificationStatus"] | "" } = {},
) {
  requireStaff(actor);
  const conditions = [];
  if (filters.q) {
    conditions.push(or(ilike(organizations.name, `%${filters.q.replace(/[\\%_]/g, "\\$&")}%`)));
  }
  if (filters.status) conditions.push(eq(organizations.verificationStatus, filters.status));

  const rows = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      slug: organizations.slug,
      type: organizations.type,
      verificationStatus: organizations.verificationStatus,
      officeCity: organizations.officeCity,
      createdAt: organizations.createdAt,
      activeJobs: sql<number>`(select count(*)::int from ${jobs} where ${jobs.organizationId} = ${organizations.id} and ${jobs.status} = 'published')`,
      members: sql<number>`(select count(*)::int from ${organizationMembers} where ${organizationMembers.organizationId} = ${organizations.id})`,
    })
    .from(organizations)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(asc(organizations.name))
    .limit(500);
  return rows;
}

export async function listOrganizationOptions(db: Database) {
  return db
    .select({
      id: organizations.id,
      name: organizations.name,
      status: organizations.verificationStatus,
    })
    .from(organizations)
    .where(inArray(organizations.verificationStatus, ["unverified", "verified"]))
    .orderBy(asc(organizations.name));
}

export async function listOrganizationMembers(db: Database, actor: Actor, organizationId: string) {
  if (!isStaff(actor) && actor.organizationId !== organizationId) throw new NotFoundError();
  return db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      status: users.status,
      joinedAt: organizationMembers.createdAt,
      lastActiveAt: sql<Date | null>`(select max(${sessions.updatedAt}) from ${sessions} where ${sessions.userId} = ${users.id})`,
    })
    .from(organizationMembers)
    .innerJoin(users, eq(users.id, organizationMembers.userId))
    .where(eq(organizationMembers.organizationId, organizationId))
    .orderBy(asc(users.name));
}

export async function countOrganizationsByStatus(db: Database) {
  const rows = await db
    .select({ status: organizations.verificationStatus, total: count() })
    .from(organizations)
    .groupBy(organizations.verificationStatus);
  return Object.fromEntries(rows.map((r) => [r.status, r.total])) as Record<string, number>;
}
