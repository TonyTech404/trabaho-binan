import { beforeAll, expect, it } from "vitest";
import { createInvitation, createPasswordReset } from "~/services/account-links.server";
import { ForbiddenError, NotFoundError, type Actor } from "~/services/common.server";
import {
  getJobForActor,
  listJobsForOrganization,
  listJobsForStaff,
} from "~/services/job-queries.server";
import {
  approveJob,
  closeJob,
  confirmJob,
  createJob,
  pauseJob,
  proposeRevision,
  renewJob,
  reviewRevision,
  submitJob,
  updateJob,
  withdrawRevision,
} from "~/services/jobs.server";
import {
  getOrganizationForActor,
  setOrganizationVerification,
  updateOwnOrganizationProfile,
} from "~/services/organizations.server";
import { listUsers, setStaffRole, setUserStatus } from "~/services/users.server";
import { describeDb, testDb } from "../helpers/db";
import { admin, jobInput, makeOrganization, makeUser } from "../helpers/factories";

describeDb("organization access boundaries", () => {
  const db = testDb();
  let reviewer: Actor;
  let employerA: Actor;
  let employerB: Actor;
  let orgA: { id: string };
  let orgB: { id: string };
  let jobB: { id: string };

  beforeAll(async () => {
    const adminActor = await admin(db);
    reviewer = await makeUser(db, "reviewer", { inviter: adminActor });
    orgA = await makeOrganization(db, reviewer);
    orgB = await makeOrganization(db, reviewer);
    employerA = await makeUser(db, "employer", { organizationId: orgA.id, inviter: reviewer });
    employerB = await makeUser(db, "employer", { organizationId: orgB.id, inviter: reviewer });
    jobB = await createJob(db, employerB, jobInput());
  });

  it("does not let employer A read employer B's job (reported as not found)", async () => {
    await expect(getJobForActor(db, employerA, jobB.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(getJobForActor(db, employerB, jobB.id)).resolves.toMatchObject({
      job: { id: jobB.id },
    });
  });

  it("does not let employer A modify employer B's job", async () => {
    await expect(updateJob(db, employerA, jobB.id, jobInput())).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(submitJob(db, employerA, jobB.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(closeJob(db, employerA, jobB.id, "filled")).rejects.toBeInstanceOf(NotFoundError);
    await expect(confirmJob(db, employerA, jobB.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      proposeRevision(db, employerA, jobB.id, jobInput(), "edit"),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("does not let employer A withdraw employer B's revision", async () => {
    const live = await createJob(db, employerB, jobInput());
    await submitJob(db, employerB, live.id);
    await approveJob(db, reviewer, live.id);
    const revision = await proposeRevision(db, employerB, live.id, jobInput(), "edit");
    await expect(withdrawRevision(db, employerA, revision.id)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("always files an employer's new job under their own organization", async () => {
    const job = await createJob(db, employerA, jobInput(), { organizationId: orgB.id });
    expect(job.organizationId).toBe(orgA.id);
  });

  it("lists only the employer's own jobs", async () => {
    const jobs = await listJobsForOrganization(db, employerA);
    expect(jobs.length).toBeGreaterThan(0);
    expect(jobs.every((j) => j.organizationId === orgA.id)).toBe(true);
  });

  it("keeps organization details private to members and staff", async () => {
    await expect(getOrganizationForActor(db, employerA, orgB.id)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(getOrganizationForActor(db, employerA, orgA.id)).resolves.toMatchObject({
      id: orgA.id,
    });
  });

  it("does not let employers publish, approve or moderate", async () => {
    const job = await createJob(db, employerA, jobInput());
    await submitJob(db, employerA, job.id);
    await expect(approveJob(db, employerA, job.id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(pauseJob(db, employerA, job.id, "no")).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      renewJob(db, employerA, job.id, new Date(Date.now() + 86_400_000)),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(listJobsForStaff(db, employerA, {})).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("does not let employers approve their own revisions", async () => {
    const live = await createJob(db, employerA, jobInput());
    await submitJob(db, employerA, live.id);
    await approveJob(db, reviewer, live.id);
    const revision = await proposeRevision(
      db,
      employerA,
      live.id,
      jobInput({ title: "Changed title" }),
      "edit",
    );
    await expect(
      reviewRevision(db, employerA, revision.id, "approve", null),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("does not let employers verify any organization, including their own", async () => {
    await expect(
      setOrganizationVerification(db, employerA, orgA.id, "verified", null),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("only accepts public profile fields from employers", async () => {
    const { organization: org } = await updateOwnOrganizationProfile(db, employerA, {
      description: "We bake bread.",
      website: null,
      publicEmail: null,
      publicPhone: null,
      officeCity: "Biñan",
      officeBarangay: null,
      officeAddress: null,
      // Extra fields a crafted request might include are ignored by the service.
      ...({ verificationStatus: "verified", name: "Renamed" } as object),
    });
    expect(org.verificationStatus).toBe("unverified");
    expect(org.name).not.toBe("Renamed");
  });

  it("does not let employers invite people or change roles", async () => {
    await expect(
      createInvitation(db, employerA, {
        email: "x@example.test",
        role: "employer",
        organizationId: orgA.id,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      createInvitation(db, employerA, { email: "y@example.test", role: "admin" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(setStaffRole(db, employerA, employerB.id, "admin")).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(setUserStatus(db, employerA, employerB.id, "suspended")).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(listUsers(db, employerA)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(createPasswordReset(db, employerA, employerB.id)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it("limits reviewers to employer accounts", async () => {
    await expect(
      createInvitation(db, reviewer, { email: "staff@example.test", role: "reviewer" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    const otherReviewer = await makeUser(db, "reviewer");
    await expect(setUserStatus(db, reviewer, otherReviewer.id, "suspended")).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(setStaffRole(db, reviewer, otherReviewer.id, "admin")).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(createPasswordReset(db, reviewer, otherReviewer.id)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(setUserStatus(db, reviewer, employerB.id, "active")).resolves.toBeTruthy();
  });

  it("does not let anyone change their own access", async () => {
    const adminActor = await admin(db);
    await expect(setStaffRole(db, adminActor, adminActor.id, "reviewer")).rejects.toThrow(
      /your own access/,
    );
    await expect(setUserStatus(db, adminActor, adminActor.id, "suspended")).rejects.toThrow(
      /your own access/,
    );
  });
});
