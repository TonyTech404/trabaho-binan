import { and, eq, isNull } from "drizzle-orm";
import { beforeAll, expect, it } from "vitest";
import { accountLinks, organizations, sessions } from "~/db/schema";
import { acceptInvitation, createInvitation } from "~/services/account-links.server";
import {
  deleteApplication,
  getApplication,
  listApplications,
  submitApplication,
} from "~/services/applications.server";
import { ConflictError, ForbiddenError, NotFoundError, type Actor } from "~/services/common.server";
import { getJobForActor } from "~/services/job-queries.server";
import {
  approveJob,
  createJob,
  pauseJob,
  proposeRevision,
  reviewRevision,
  submitJob,
} from "~/services/jobs.server";
import {
  reviewProfileChange,
  setOrganizationVerification,
  updateOwnOrganizationProfile,
} from "~/services/organizations.server";
import { getPublicJob, jobPageView } from "~/services/public-jobs.server";
import {
  isSignInLocked,
  recordSignIn,
  SIGN_IN_MAX_FAILURES,
  signInKey,
} from "~/services/sign-in.server";
import { setStaffRole, setUserStatus } from "~/services/users.server";
import type { ResumeStore } from "~/lib/resume";
import { describeDb, testDb } from "../helpers/db";
import { admin, jobInput, makeOrganization, makeUser, uid } from "../helpers/factories";

function memoryStore() {
  const objects = new Map<string, Uint8Array>();
  const store: ResumeStore = {
    async put(key, body) {
      objects.set(key, body);
    },
    async get(key) {
      const body = objects.get(key);
      return body
        ? { body: new Blob([new Uint8Array(body)]).stream(), size: body.byteLength }
        : null;
    },
    async delete(keys) {
      for (const k of keys) objects.delete(k);
    },
  };
  return { store, objects };
}

const profile = (description: string) => ({
  description,
  website: null,
  publicEmail: null,
  publicPhone: null,
  officeCity: "Biñan",
  officeBarangay: null,
  officeAddress: null,
});

describeDb("employer profile changes are reviewed", () => {
  const db = testDb();
  let reviewer: Actor;
  let employer: Actor;
  let orgId: string;

  beforeAll(async () => {
    reviewer = await makeUser(db, "reviewer", { inviter: await admin(db) });
    orgId = (await makeOrganization(db, reviewer)).id;
    employer = await makeUser(db, "employer", { organizationId: orgId, inviter: reviewer });
  });

  const current = async () =>
    (await db.select().from(organizations).where(eq(organizations.id, orgId)))[0];

  it("holds an employer's change until a reviewer approves exactly what they saw", async () => {
    const { submitted } = await updateOwnOrganizationProfile(
      db,
      employer,
      profile("Pay a ₱500 processing fee to apply."),
    );
    expect(submitted).toBe(true);
    const held = await current();
    expect(held.description).toBeNull(); // the public profile is unchanged
    expect(held.pendingProfile?.description).toContain("processing fee");

    // The employer edits again after the reviewer opened the first version.
    const seen = held.pendingProfileSubmittedAt!.toISOString();
    await new Promise((r) => setTimeout(r, 5));
    await updateOwnOrganizationProfile(db, employer, profile("Family bakery since 1990."));
    await expect(
      reviewProfileChange(db, reviewer, orgId, "approve", { submittedAt: seen, note: null }),
    ).rejects.toBeInstanceOf(ConflictError);

    // Employers cannot approve their own changes.
    const latest = (await current()).pendingProfileSubmittedAt!.toISOString();
    await expect(
      reviewProfileChange(db, employer, orgId, "approve", { submittedAt: latest, note: null }),
    ).rejects.toBeInstanceOf(ForbiddenError);

    await reviewProfileChange(db, reviewer, orgId, "approve", { submittedAt: latest, note: null });
    const approved = await current();
    expect(approved.description).toBe("Family bakery since 1990.");
    expect(approved.pendingProfile).toBeNull();
  });

  it("keeps the approved profile when a change is rejected, and tells the employer why", async () => {
    await updateOwnOrganizationProfile(db, employer, profile("Text us on Viber to apply."));
    const seen = (await current()).pendingProfileSubmittedAt!.toISOString();
    await reviewProfileChange(db, reviewer, orgId, "reject", {
      submittedAt: seen,
      note: "Applicants must apply through the listing.",
    });
    const after = await current();
    expect(after.description).toBe("Family bakery since 1990.");
    expect(after.pendingProfile).toBeNull();
    expect(after.profileReviewNote).toBe("Applicants must apply through the listing.");
  });
});

describeDb("suspending an organization cuts off its people", () => {
  const db = testDb();

  it("ends sessions, stops invitations and refuses new ones", async () => {
    const reviewer = await makeUser(db, "reviewer", { inviter: await admin(db) });
    const org = await makeOrganization(db, reviewer);
    const member = await makeUser(db, "employer", { organizationId: org.id, inviter: reviewer });
    await db.insert(sessions).values({
      userId: member.id,
      token: `test-${uid()}`,
      expiresAt: new Date(Date.now() + 86_400_000),
    });
    const { token } = await createInvitation(db, reviewer, {
      email: `pending-${uid()}@example.test`,
      role: "employer",
      organizationId: org.id,
    });

    await setOrganizationVerification(db, reviewer, org.id, "suspended", "Fee complaints");

    expect(await db.select().from(sessions).where(eq(sessions.userId, member.id))).toHaveLength(0);
    const open = await db
      .select()
      .from(accountLinks)
      .where(and(eq(accountLinks.organizationId, org.id), isNull(accountLinks.revokedAt)));
    expect(open.filter((l) => !l.usedAt)).toHaveLength(0);
    await expect(
      acceptInvitation(db, token, { name: "Late Joiner", password: "a-long-password-1" }),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});

describeDb("approvals cover only what the reviewer saw", () => {
  const db = testDb();
  let reviewer: Actor;
  let employer: Actor;

  beforeAll(async () => {
    reviewer = await makeUser(db, "reviewer", { inviter: await admin(db) });
    const org = await makeOrganization(db, reviewer);
    employer = await makeUser(db, "employer", { organizationId: org.id, inviter: reviewer });
  });

  it("refuses to publish an employer's draft that was never submitted", async () => {
    const draft = await createJob(db, employer, jobInput());
    await expect(approveJob(db, reviewer, draft.id)).rejects.toBeInstanceOf(ConflictError);
  });

  it("lets staff publish a draft they created", async () => {
    const org = await makeOrganization(db, reviewer);
    const draft = await createJob(db, reviewer, jobInput(), { organizationId: org.id });
    await expect(approveJob(db, reviewer, draft.id)).resolves.toMatchObject({
      status: "published",
    });
  });

  it("refuses an approval if the listing changed after the reviewer opened it", async () => {
    const job = await createJob(db, employer, jobInput());
    const submitted = await submitJob(db, employer, job.id);
    const { job: seen } = await getJobForActor(db, reviewer, job.id);
    await expect(
      approveJob(db, reviewer, job.id, null, new Date(), {
        expectedUpdatedAt: new Date(seen.updatedAt.getTime() - 1000).toISOString(),
      }),
    ).rejects.toBeInstanceOf(ConflictError);
    await expect(
      approveJob(db, reviewer, submitted.id, null, new Date(), {
        expectedUpdatedAt: seen.updatedAt.toISOString(),
      }),
    ).resolves.toMatchObject({ status: "published" });
  });

  it("refuses to approve a revision the employer changed after it was opened", async () => {
    const job = await createJob(db, employer, jobInput());
    await submitJob(db, employer, job.id);
    await approveJob(db, reviewer, job.id);
    const first = await proposeRevision(
      db,
      employer,
      job.id,
      jobInput({ title: "Cashier A" }),
      "edit",
    );
    const seen = first.submittedAt!.toISOString();
    await new Promise((r) => setTimeout(r, 5));
    await proposeRevision(
      db,
      employer,
      job.id,
      jobInput({ title: "Cashier B, pay a fee" }),
      "edit",
    );
    await expect(
      reviewRevision(db, reviewer, first.id, "approve", null, new Date(), seen),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("returns not found for malformed ids instead of failing", async () => {
    await expect(approveJob(db, reviewer, "not-a-uuid")).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      reviewRevision(db, reviewer, "x'; drop table jobs; --", "approve", null),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describeDb("paused listings", () => {
  const db = testDb();

  it("show only their title and facts publicly", async () => {
    const reviewer = await makeUser(db, "reviewer", { inviter: await admin(db) });
    const org = await makeOrganization(db, reviewer);
    const job = await createJob(
      db,
      reviewer,
      jobInput({
        description: "Send ₱500 to GCash 0917 000 0000 to reserve your slot.",
        applicationEmail: "jobs@example.test",
      }),
      { organizationId: org.id },
    );
    await approveJob(db, reviewer, job.id);
    await pauseJob(db, reviewer, job.id, "Fee report under review");

    const result = (await getPublicJob(db, job.publicId))!;
    const page = jobPageView(result);
    expect(page.state).toBe("paused");
    expect(JSON.stringify(page)).not.toContain("GCash");
    expect(page.job.applicationEmail).toBeNull();
    expect(page.job.walkInInstructions).toBeNull();
    expect(page.job).not.toHaveProperty("id");
    expect(page.organization).not.toHaveProperty("id");
  });
});

describeDb("staff accounts", () => {
  const db = testDb();

  it("stops two administrators from removing each other at once", async () => {
    const first = await makeUser(db, "admin", { inviter: await admin(db) });
    const second = await makeUser(db, "admin", { inviter: await admin(db) });
    await setStaffRole(db, first, second.id, "reviewer");
    // The second, no longer an administrator, cannot demote the first.
    await expect(setStaffRole(db, second, first.id, "reviewer")).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it("revokes unused links created by an administrator who is suspended", async () => {
    const rogue = await makeUser(db, "admin", { inviter: await admin(db) });
    await createInvitation(db, rogue, { email: `later-${uid()}@example.test`, role: "admin" });
    await setUserStatus(db, await admin(db), rogue.id, "suspended");
    const open = await db
      .select()
      .from(accountLinks)
      .where(and(eq(accountLinks.createdById, rogue.id), isNull(accountLinks.revokedAt)));
    expect(open).toHaveLength(0);
  });

  it("does not let a reviewer replace a pending staff invitation", async () => {
    const reviewer = await makeUser(db, "reviewer", { inviter: await admin(db) });
    const org = await makeOrganization(db, reviewer);
    const email = `staff-${uid()}@example.test`;
    await createInvitation(db, await admin(db), { email, role: "reviewer" });
    await expect(
      createInvitation(db, reviewer, { email, role: "employer", organizationId: org.id }),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});

describeDb("sign-in attempts", () => {
  const db = testDb();

  it("pauses an account after repeated failures, whatever address they come from", async () => {
    const email = `target-${uid()}@example.test`;
    const key = await signInKey(email);
    for (let i = 0; i < SIGN_IN_MAX_FAILURES; i++) {
      expect(await isSignInLocked(db, key)).toBe(false);
      await recordSignIn(db, { key, email, ip: `203.0.113.${i}`, country: "PH", user: null });
    }
    expect(await isSignInLocked(db, key)).toBe(true);
    // Other accounts are unaffected.
    expect(await isSignInLocked(db, await signInKey(`other-${uid()}@example.test`))).toBe(false);
  });
});

describeDb("deleting an application", () => {
  const db = testDb();

  it("is for staff only, and removes the files", async () => {
    const reviewer = await makeUser(db, "reviewer", { inviter: await admin(db) });
    const org = await makeOrganization(db, reviewer);
    const employer = await makeUser(db, "employer", { organizationId: org.id, inviter: reviewer });
    const job = await createJob(db, reviewer, jobInput({ acceptsApplications: "on" }), {
      organizationId: org.id,
    });
    await approveJob(db, reviewer, job.id);
    const { store, objects } = memoryStore();
    const pdf = new TextEncoder().encode("%PDF-1.4 sample");
    const { reference } = await submitApplication(
      db,
      store,
      job.publicId,
      {
        fullName: "Spam Bot",
        phone: "+639000001234",
        email: null,
        experience: null,
        message: null,
        consent: "on",
      },
      [{ bytes: pdf, filename: "spam.pdf" }],
    );
    expect(objects.size).toBe(1);
    const [row] = (await listApplications(db, reviewer, {})).filter(
      (a) => a.reference === reference,
    );

    await expect(deleteApplication(db, store, employer, row.id, "spam")).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await deleteApplication(db, store, reviewer, row.id, "spam");
    expect(objects.size).toBe(0);
    await expect(getApplication(db, reviewer, row.id)).rejects.toBeInstanceOf(NotFoundError);
  });
});
