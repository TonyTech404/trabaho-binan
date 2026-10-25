import { and, count, eq, gt, sql } from "drizzle-orm";
import type { Database } from "~/db/client.server";
import { auditEvents, users } from "~/db/schema";
import { sha256Hex } from "~/lib/ids";
import { coarseNetwork } from "~/lib/rate-limit.server";
import { recordAudit } from "./common.server";

/** After this many failed sign-ins for one account, it waits out the window. */
export const SIGN_IN_MAX_FAILURES = 10;
export const SIGN_IN_WINDOW_MINUTES = 15;

/**
 * Failed attempts are counted per email address, hashed so that addresses
 * that do not belong to anyone are never stored.
 */
export const signInKey = (email: string) => sha256Hex(`sign-in:${email.trim().toLowerCase()}`);

export async function isSignInLocked(db: Database, key: string, now = new Date()) {
  const since = new Date(now.getTime() - SIGN_IN_WINDOW_MINUTES * 60_000);
  const [row] = await db
    .select({ failures: count() })
    .from(auditEvents)
    .where(
      and(
        eq(auditEvents.action, "user.sign_in_failed"),
        gt(auditEvents.createdAt, since),
        sql`${auditEvents.metadata}->>'key' = ${key}`,
      ),
    );
  return (row?.failures ?? 0) >= SIGN_IN_MAX_FAILURES;
}

/**
 * Records a sign-in attempt in the audit history, with the network (not the
 * full address) and country it came from, for investigating misuse.
 */
export async function recordSignIn(
  db: Database,
  attempt: {
    key: string;
    email: string;
    ip: string | null;
    country: string | null;
    user: { id: string; role: "admin" | "reviewer" | "employer" } | null;
  },
) {
  const where = {
    network: attempt.ip ? coarseNetwork(attempt.ip) : null,
    country: attempt.country,
  };
  if (attempt.user) {
    await recordAudit(db, attempt.user, {
      action: "user.sign_in",
      entityType: "user",
      entityId: attempt.user.id,
      metadata: where,
    });
    return;
  }
  const [known] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, attempt.email))
    .limit(1);
  await recordAudit(db, null, {
    action: "user.sign_in_failed",
    entityType: "user",
    entityId: known?.id ?? null,
    metadata: { key: attempt.key, ...where },
  });
}
