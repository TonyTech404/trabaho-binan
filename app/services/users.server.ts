import { and, asc, eq, isNull, sql } from "drizzle-orm";
import type { Database } from "~/db/client.server";
import { accountLinks, organizationMembers, organizations, sessions, users } from "~/db/schema";
import {
  ConflictError,
  ForbiddenError,
  isAdmin,
  NotFoundError,
  recordAudit,
  requireAdmin,
  requireStaff,
  type Actor,
  type Tx,
} from "./common.server";

export async function listUsers(db: Database, actor: Actor) {
  requireAdmin(actor);
  return db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      status: users.status,
      createdAt: users.createdAt,
      organizationId: organizations.id,
      organizationName: organizations.name,
      lastActiveAt: sql<Date | null>`(select max(${sessions.updatedAt}) from ${sessions} where ${sessions.userId} = ${users.id})`,
    })
    .from(users)
    .leftJoin(organizationMembers, eq(organizationMembers.userId, users.id))
    .leftJoin(organizations, eq(organizations.id, organizationMembers.organizationId))
    .orderBy(asc(users.role), asc(users.name));
}

async function loadTarget(db: Database, actor: Actor, userId: string) {
  requireStaff(actor);
  if (!/^[0-9a-f-]{36}$/i.test(userId)) throw new NotFoundError("User not found.");
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw new NotFoundError("User not found.");
  if (user.id === actor.id) throw new ConflictError("You cannot change your own access.");
  // Reviewers manage employer accounts only; staff accounts belong to administrators.
  if (!isAdmin(actor) && user.role !== "employer")
    throw new ForbiddenError("Only administrators can manage staff accounts.");
  return user;
}

/**
 * Re-reads the acting administrator under a row lock inside the change, so
 * two administrators cannot remove each other at the same moment and leave
 * nobody in charge.
 */
async function assertStillAdmin(tx: Tx, actor: Actor) {
  const [me] = await tx
    .select({ role: users.role, status: users.status })
    .from(users)
    .where(eq(users.id, actor.id))
    .for("update")
    .limit(1);
  if (me?.role !== "admin" || me.status !== "active") throw new ForbiddenError();
}

/** Unused invitation and password-reset links a person created stop working. */
async function revokeLinksCreatedBy(tx: Tx, userId: string, now = new Date()) {
  await tx
    .update(accountLinks)
    .set({ revokedAt: now })
    .where(
      and(
        eq(accountLinks.createdById, userId),
        isNull(accountLinks.usedAt),
        isNull(accountLinks.revokedAt),
      ),
    );
}

/** Suspending revokes access immediately: every session is deleted. */
export async function setUserStatus(
  db: Database,
  actor: Actor,
  userId: string,
  status: "active" | "suspended",
) {
  const user = await loadTarget(db, actor, userId);
  if (user.status === status) return user;
  return db.transaction(async (tx) => {
    if (user.role !== "employer") await assertStillAdmin(tx, actor);
    const [updated] = await tx
      .update(users)
      .set({ status })
      .where(eq(users.id, user.id))
      .returning();
    if (status === "suspended") {
      await tx.delete(sessions).where(eq(sessions.userId, user.id));
      await revokeLinksCreatedBy(tx, user.id);
    }
    await recordAudit(tx, actor, {
      action: status === "suspended" ? "user.suspend" : "user.reactivate",
      entityType: "user",
      entityId: user.id,
      summary: `${status === "suspended" ? "Suspended" : "Reactivated"} ${user.email}`,
    });
    return updated;
  });
}

/** Administrators can move staff between reviewer and administrator. Employer accounts keep their role. */
export async function setStaffRole(
  db: Database,
  actor: Actor,
  userId: string,
  role: "admin" | "reviewer",
) {
  requireAdmin(actor);
  const user = await loadTarget(db, actor, userId);
  if (user.role === "employer")
    throw new ConflictError(
      "Employer accounts cannot be given staff roles. Invite the person as staff instead.",
    );
  if (user.role === role) return user;
  return db.transaction(async (tx) => {
    await assertStillAdmin(tx, actor);
    const [updated] = await tx.update(users).set({ role }).where(eq(users.id, user.id)).returning();
    // A demoted administrator's pending staff invitations must not outlive the role.
    if (role !== "admin") await revokeLinksCreatedBy(tx, user.id);
    await recordAudit(tx, actor, {
      action: "user.role_change",
      entityType: "user",
      entityId: user.id,
      summary: `${user.email}: ${user.role} → ${role}`,
      metadata: { from: user.role, to: role },
    });
    return updated;
  });
}

/** Sign a user out everywhere without suspending them. */
export async function revokeSessions(db: Database, actor: Actor, userId: string) {
  const user = await loadTarget(db, actor, userId);
  await db.transaction(async (tx) => {
    await tx.delete(sessions).where(eq(sessions.userId, user.id));
    await recordAudit(tx, actor, {
      action: "user.sessions_revoke",
      entityType: "user",
      entityId: user.id,
      summary: `Signed out ${user.email} everywhere`,
    });
  });
}
