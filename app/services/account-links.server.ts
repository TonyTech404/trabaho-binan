import { and, eq, gt, isNull, sql } from "drizzle-orm";
import type { Database } from "~/db/client.server";
import {
  accountLinks,
  accounts,
  organizationMembers,
  organizations,
  sessions,
  users,
  type AccountLink,
  type UserRole,
} from "~/db/schema";
import { randomToken, sha256Hex } from "~/lib/ids";
import { hashPassword } from "~/lib/password.server";
import {
  ConflictError,
  ForbiddenError,
  InputError,
  isAdmin,
  isStaff,
  NotFoundError,
  recordAudit,
  type Actor,
} from "./common.server";

export const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const PASSWORD_RESET_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * No email provider is configured for the $0 pilot. Links are shown once to
 * the staff member who created them, who delivers them through an approved
 * channel. Only a SHA-256 hash of each token is stored.
 */
export function accountLinkUrl(
  baseUrl: string,
  link: { purpose: AccountLink["purpose"] },
  token: string,
) {
  const path = link.purpose === "invitation" ? "/invite" : "/reset-password";
  return `${baseUrl}${path}/${token}`;
}

export async function createInvitation(
  db: Database,
  actor: Actor | null,
  input: { email: string; role: UserRole; organizationId?: string | null },
  now = new Date(),
): Promise<{ link: AccountLink; token: string }> {
  const email = input.email.trim().toLowerCase();
  // actor === null is only used by the administrator bootstrap script.
  if (actor === null) {
    if (input.role !== "admin")
      throw new ForbiddenError("Bootstrap can only invite administrators.");
  } else if (!isStaff(actor)) {
    throw new ForbiddenError();
  } else if (!isAdmin(actor) && input.role !== "employer") {
    throw new ForbiddenError("Only administrators can invite staff.");
  }

  const organizationId = input.role === "employer" ? input.organizationId : null;
  if (input.role === "employer" && !organizationId) {
    throw new InputError("Choose the employer this person belongs to.", {
      organizationId: "Choose an employer.",
    });
  }

  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    if (existing) throw new ConflictError("An account with this email already exists.");

    if (organizationId) {
      const [org] = await tx
        .select({ status: organizations.verificationStatus })
        .from(organizations)
        .where(eq(organizations.id, organizationId))
        .limit(1);
      if (!org) throw new NotFoundError("Organization not found.");
      if (org.status === "suspended") throw new ConflictError("This organization is suspended.");
    }

    // A new invitation replaces any unused one for the same address.
    await tx
      .update(accountLinks)
      .set({ revokedAt: now })
      .where(
        and(
          eq(accountLinks.email, email),
          eq(accountLinks.purpose, "invitation"),
          isNull(accountLinks.usedAt),
          isNull(accountLinks.revokedAt),
        ),
      );

    const token = randomToken();
    const [link] = await tx
      .insert(accountLinks)
      .values({
        tokenHash: await sha256Hex(token),
        purpose: "invitation",
        email,
        role: input.role,
        organizationId: organizationId ?? null,
        createdById: actor?.id ?? null,
        expiresAt: new Date(now.getTime() + INVITATION_TTL_MS),
      })
      .returning();
    await recordAudit(tx, actor, {
      action: "invitation.create",
      entityType: "account_link",
      entityId: link.id,
      summary: `Invited ${email} as ${input.role}`,
      metadata: { email, role: input.role, organizationId },
    });
    return { link, token };
  });
}

/** A usable (unexpired, unused, unrevoked) link for the token, or null. */
export async function findUsableLink(
  db: Database,
  token: string,
  purpose: AccountLink["purpose"],
  now = new Date(),
) {
  if (!/^[A-Za-z0-9_-]{40,64}$/.test(token)) return null;
  const [row] = await db
    .select({
      link: accountLinks,
      organizationName: organizations.name,
      userName: users.name,
      userEmail: users.email,
    })
    .from(accountLinks)
    .leftJoin(organizations, eq(organizations.id, accountLinks.organizationId))
    .leftJoin(users, eq(users.id, accountLinks.userId))
    .where(
      and(
        eq(accountLinks.tokenHash, await sha256Hex(token)),
        eq(accountLinks.purpose, purpose),
        isNull(accountLinks.usedAt),
        isNull(accountLinks.revokedAt),
        gt(accountLinks.expiresAt, now),
      ),
    )
    .limit(1);
  return row ?? null;
}

async function lockUsableLink(
  tx: Parameters<Parameters<Database["transaction"]>[0]>[0],
  token: string,
  purpose: AccountLink["purpose"],
  now: Date,
) {
  const [link] = await tx
    .select()
    .from(accountLinks)
    .where(
      and(eq(accountLinks.tokenHash, await sha256Hex(token)), eq(accountLinks.purpose, purpose)),
    )
    .for("update")
    .limit(1);
  if (!link || link.usedAt || link.revokedAt || link.expiresAt.getTime() <= now.getTime()) {
    throw new ConflictError("This link has expired or has already been used. Ask for a new one.");
  }
  return link;
}

export async function acceptInvitation(
  db: Database,
  token: string,
  input: { name: string; password: string },
  now = new Date(),
) {
  return db.transaction(async (tx) => {
    const link = await lockUsableLink(tx, token, "invitation", now);
    if (!link.email || !link.role) throw new ConflictError("This invitation is incomplete.");

    const [existing] = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, link.email))
      .limit(1);
    if (existing)
      throw new ConflictError("An account with this email already exists. Sign in instead.");

    const [user] = await tx
      .insert(users)
      .values({
        name: input.name,
        email: link.email,
        emailVerified: true,
        role: link.role,
        status: "active",
      })
      .returning();
    // Same shape Better Auth uses for email/password ("credential") accounts.
    await tx.insert(accounts).values({
      userId: user.id,
      accountId: user.id,
      providerId: "credential",
      password: await hashPassword(tx, input.password),
    });
    if (link.role === "employer" && link.organizationId) {
      await tx.insert(organizationMembers).values({
        organizationId: link.organizationId,
        userId: user.id,
        createdById: link.createdById,
      });
    }
    await tx
      .update(accountLinks)
      .set({ usedAt: now, userId: user.id })
      .where(eq(accountLinks.id, link.id));
    await recordAudit(
      tx,
      { id: user.id, role: user.role },
      {
        action: "invitation.accept",
        entityType: "user",
        entityId: user.id,
        summary: `${user.email} joined as ${user.role}`,
        metadata: {
          linkId: link.id,
          invitedBy: link.createdById,
          organizationId: link.organizationId,
        },
      },
    );
    return user;
  });
}

export async function createPasswordReset(
  db: Database,
  actor: Actor,
  userId: string,
  now = new Date(),
) {
  if (!isStaff(actor)) throw new ForbiddenError();
  return db.transaction(async (tx) => {
    const [user] = await tx.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) throw new NotFoundError("User not found.");
    if (!isAdmin(actor) && user.role !== "employer") {
      throw new ForbiddenError("Only administrators can reset staff passwords.");
    }
    await tx
      .update(accountLinks)
      .set({ revokedAt: now })
      .where(
        and(
          eq(accountLinks.userId, userId),
          eq(accountLinks.purpose, "password_reset"),
          isNull(accountLinks.usedAt),
          isNull(accountLinks.revokedAt),
        ),
      );
    const token = randomToken();
    const [link] = await tx
      .insert(accountLinks)
      .values({
        tokenHash: await sha256Hex(token),
        purpose: "password_reset",
        email: user.email,
        userId: user.id,
        createdById: actor.id,
        expiresAt: new Date(now.getTime() + PASSWORD_RESET_TTL_MS),
      })
      .returning();
    await recordAudit(tx, actor, {
      action: "password_reset.create",
      entityType: "user",
      entityId: user.id,
      summary: `Password reset link created for ${user.email}`,
    });
    return { link, token };
  });
}

/** Set a new password from a reset link and sign the account out everywhere. */
export async function resetPassword(
  db: Database,
  token: string,
  password: string,
  now = new Date(),
) {
  return db.transaction(async (tx) => {
    const link = await lockUsableLink(tx, token, "password_reset", now);
    if (!link.userId) throw new ConflictError("This link is incomplete.");
    const [user] = await tx.select().from(users).where(eq(users.id, link.userId)).limit(1);
    if (!user) throw new NotFoundError("User not found.");
    if (user.status !== "active") {
      throw new ConflictError("This account is suspended. Contact an administrator.");
    }

    const hash = await hashPassword(tx, password);
    const updated = await tx
      .update(accounts)
      .set({ password: hash })
      .where(and(eq(accounts.userId, user.id), eq(accounts.providerId, "credential")))
      .returning({ id: accounts.id });
    if (updated.length === 0) {
      await tx
        .insert(accounts)
        .values({ userId: user.id, accountId: user.id, providerId: "credential", password: hash });
    }
    await tx.delete(sessions).where(eq(sessions.userId, user.id));
    await tx.update(accountLinks).set({ usedAt: now }).where(eq(accountLinks.id, link.id));
    await recordAudit(
      tx,
      { id: user.id, role: user.role },
      {
        action: "password_reset.complete",
        entityType: "user",
        entityId: user.id,
        summary: `Password reset for ${user.email}`,
        metadata: { linkId: link.id },
      },
    );
    return user;
  });
}

export async function revokeAccountLink(
  db: Database,
  actor: Actor,
  linkId: string,
  now = new Date(),
) {
  if (!isStaff(actor)) throw new ForbiddenError();
  return db.transaction(async (tx) => {
    const [link] = await tx
      .select()
      .from(accountLinks)
      .where(eq(accountLinks.id, linkId))
      .for("update")
      .limit(1);
    if (!link) throw new NotFoundError();
    // Reviewers manage employer invitations and the reset links they issued.
    const reviewerMayRevoke =
      (link.purpose === "invitation" && link.role === "employer") || link.createdById === actor.id;
    if (!isAdmin(actor) && !reviewerMayRevoke) throw new ForbiddenError();
    if (link.usedAt || link.revokedAt) return link;
    const [updated] = await tx
      .update(accountLinks)
      .set({ revokedAt: now })
      .where(eq(accountLinks.id, link.id))
      .returning();
    await recordAudit(tx, actor, {
      action: `${link.purpose}.revoke`,
      entityType: "account_link",
      entityId: link.id,
      summary: link.email ? `Revoked link for ${link.email}` : "Revoked link",
    });
    return updated;
  });
}

export async function listOpenLinks(db: Database, actor: Actor, now = new Date()) {
  if (!isStaff(actor)) throw new ForbiddenError();
  const rows = await db
    .select({
      id: accountLinks.id,
      purpose: accountLinks.purpose,
      email: accountLinks.email,
      role: accountLinks.role,
      expiresAt: accountLinks.expiresAt,
      createdAt: accountLinks.createdAt,
      organizationName: organizations.name,
    })
    .from(accountLinks)
    .leftJoin(organizations, eq(organizations.id, accountLinks.organizationId))
    .where(
      and(
        isNull(accountLinks.usedAt),
        isNull(accountLinks.revokedAt),
        gt(accountLinks.expiresAt, now),
        isAdmin(actor) ? undefined : sql`${accountLinks.role} = 'employer'`,
      ),
    )
    .orderBy(accountLinks.createdAt);
  return rows;
}
