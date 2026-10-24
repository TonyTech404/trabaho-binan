import { eq } from "drizzle-orm";
import { beforeAll, expect, it } from "vitest";
import { accountLinks, accounts, sessions, users } from "~/db/schema";
import { createAuth } from "~/lib/auth.server";
import { hashPassword, verifyPassword } from "~/lib/password.server";
import {
  acceptInvitation,
  createInvitation,
  createPasswordReset,
  findUsableLink,
  resetPassword,
  revokeAccountLink,
} from "~/services/account-links.server";
import { ConflictError, type Actor } from "~/services/common.server";
import { revokeSessions, setUserStatus } from "~/services/users.server";
import { describeDb, testDb } from "../helpers/db";
import { admin, makeOrganization, makeUser, PASSWORD, uid } from "../helpers/factories";

describeDb("accounts and authentication", () => {
  const db = testDb();
  const auth = () =>
    createAuth(db, {
      baseURL: "http://localhost:5173",
      secret: "test-secret-0123456789-abcdefghijklmnopqrstuvwxyz",
      secureCookies: false,
    });
  let adminActor: Actor;
  let reviewer: Actor;

  async function signIn(email: string, password = PASSWORD) {
    const result = await auth().api.signInEmail({
      body: { email, password },
      headers: new Headers(),
      returnHeaders: true,
    });
    const cookie = result.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");
    return { cookie, user: result.response.user };
  }

  async function session(cookie: string) {
    return auth().api.getSession({ headers: new Headers({ cookie }) });
  }

  beforeAll(async () => {
    adminActor = await admin(db);
    reviewer = await makeUser(db, "reviewer", { inviter: adminActor });
  });

  it("hashes passwords with bcrypt in PostgreSQL", async () => {
    const hash = await hashPassword(db, "a-strong-test-password");
    expect(hash).toMatch(/^\$2[aby]\$10\$/);
    expect(await verifyPassword(db, hash, "a-strong-test-password")).toBe(true);
    expect(await verifyPassword(db, hash, "wrong-password")).toBe(false);
    expect(await verifyPassword(db, "not-a-bcrypt-hash", "x")).toBe(false);
  });

  it("creates the account with the invited role and organization", async () => {
    const org = await makeOrganization(db, reviewer);
    const email = `invitee-${uid()}@example.test`;
    const { token, link } = await createInvitation(db, reviewer, {
      email,
      role: "employer",
      organizationId: org.id,
    });
    const [stored] = await db.select().from(accountLinks).where(eq(accountLinks.id, link.id));
    expect(stored.tokenHash).not.toContain(token); // only a hash is stored

    const user = await acceptInvitation(db, token, { name: "New Employer", password: PASSWORD });
    expect(user.role).toBe("employer");
    const [credential] = await db.select().from(accounts).where(eq(accounts.userId, user.id));
    expect(credential.providerId).toBe("credential");
    expect(credential.password).toMatch(/^\$2/);
  });

  it("does not let an invitation be used twice", async () => {
    const email = `twice-${uid()}@example.test`;
    const { token } = await createInvitation(db, adminActor, { email, role: "reviewer" });
    await acceptInvitation(db, token, { name: "Once", password: PASSWORD });
    await expect(
      acceptInvitation(db, token, { name: "Twice", password: PASSWORD }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(await findUsableLink(db, token, "invitation")).toBeNull();
  });

  it("rejects expired, revoked and replaced invitations", async () => {
    const past = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    const expired = await createInvitation(
      db,
      adminActor,
      { email: `old-${uid()}@example.test`, role: "reviewer" },
      past,
    );
    await expect(
      acceptInvitation(db, expired.token, { name: "Late", password: PASSWORD }),
    ).rejects.toBeInstanceOf(ConflictError);

    const revoked = await createInvitation(db, adminActor, {
      email: `rev-${uid()}@example.test`,
      role: "reviewer",
    });
    await revokeAccountLink(db, adminActor, revoked.link.id);
    await expect(
      acceptInvitation(db, revoked.token, { name: "Revoked", password: PASSWORD }),
    ).rejects.toBeInstanceOf(ConflictError);

    const email = `replaced-${uid()}@example.test`;
    const first = await createInvitation(db, adminActor, { email, role: "reviewer" });
    await createInvitation(db, adminActor, { email, role: "reviewer" });
    await expect(
      acceptInvitation(db, first.token, { name: "Old link", password: PASSWORD }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("signs in with the invited password and reads the session fresh", async () => {
    const user = await makeUser(db, "reviewer", { inviter: adminActor });
    const { cookie, user: signedIn } = await signIn(user.email);
    expect((signedIn as { role?: string }).role).toBe("reviewer");
    const s = await session(cookie);
    expect(s?.user.id).toBe(user.id);
    await expect(signIn(user.email, "wrong-password-123")).rejects.toThrow();
  });

  it("does not allow public sign-up", async () => {
    await expect(
      auth().api.signUpEmail({
        body: { email: `self-${uid()}@example.test`, password: PASSWORD, name: "Self" },
        headers: new Headers(),
      }),
    ).rejects.toThrow();
  });

  it("revokes access immediately when an account is suspended", async () => {
    const org = await makeOrganization(db, reviewer);
    const employer = await makeUser(db, "employer", { organizationId: org.id, inviter: reviewer });
    const { cookie } = await signIn(employer.email);
    expect(await session(cookie)).not.toBeNull();

    await setUserStatus(db, reviewer, employer.id, "suspended");
    expect(await session(cookie)).toBeNull();
    // A suspended account cannot start a new session either.
    await expect(signIn(employer.email)).rejects.toThrow();

    await setUserStatus(db, reviewer, employer.id, "active");
    await expect(signIn(employer.email)).resolves.toBeTruthy();
  });

  it("signs a user out everywhere on request", async () => {
    const user = await makeUser(db, "reviewer", { inviter: adminActor });
    const { cookie } = await signIn(user.email);
    await revokeSessions(db, adminActor, user.id);
    expect(await session(cookie)).toBeNull();
  });

  it("resets a password with a single-use link and ends existing sessions", async () => {
    const user = await makeUser(db, "reviewer", { inviter: adminActor });
    const { cookie } = await signIn(user.email);
    const { token } = await createPasswordReset(db, adminActor, user.id);
    await resetPassword(db, token, "a-brand-new-password");

    expect(await session(cookie)).toBeNull();
    const remaining = await db.select().from(sessions).where(eq(sessions.userId, user.id));
    expect(remaining).toHaveLength(0);
    await expect(signIn(user.email)).rejects.toThrow();
    await expect(signIn(user.email, "a-brand-new-password")).resolves.toBeTruthy();
    await expect(resetPassword(db, token, "another-password-1")).rejects.toBeInstanceOf(
      ConflictError,
    );
  });

  it("will not reset the password of a suspended account", async () => {
    const user = await makeUser(db, "reviewer", { inviter: adminActor });
    const { token } = await createPasswordReset(db, adminActor, user.id);
    await db.update(users).set({ status: "suspended" }).where(eq(users.id, user.id));
    await expect(resetPassword(db, token, "a-brand-new-password")).rejects.toBeInstanceOf(
      ConflictError,
    );
  });
});
