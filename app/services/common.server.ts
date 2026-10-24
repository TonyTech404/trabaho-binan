import type { Database } from "~/db/client.server";
import { auditEvents, jobEvents, type UserRole } from "~/db/schema";

export type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
export type DbOrTx = Database | Tx;

/** The signed-in user performing an action, as established by the session. */
export interface Actor {
  id: string;
  role: UserRole;
  /** Set for employer accounts; null for staff. */
  organizationId: string | null;
}

export const isStaff = (actor: Pick<Actor, "role">) =>
  actor.role === "admin" || actor.role === "reviewer";
export const isAdmin = (actor: Pick<Actor, "role">) => actor.role === "admin";

export class ServiceError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/** Unknown record, or a record the actor may not see (never reveal which). */
export class NotFoundError extends ServiceError {
  constructor(message = "Not found.") {
    super(message, 404);
  }
}

export class ForbiddenError extends ServiceError {
  constructor(message = "You do not have permission to do that.") {
    super(message, 403);
  }
}

/** The action is not valid in the record's current state. */
export class ConflictError extends ServiceError {
  constructor(message: string) {
    super(message, 409);
  }
}

export class InputError extends ServiceError {
  constructor(
    message: string,
    readonly fieldErrors: Record<string, string | undefined> = {},
  ) {
    super(message, 400);
  }
}

export function requireStaff(actor: Actor) {
  if (!isStaff(actor)) throw new ForbiddenError();
}

export function requireAdmin(actor: Actor) {
  if (!isAdmin(actor)) throw new ForbiddenError();
}

export async function recordAudit(
  db: DbOrTx,
  actor: Pick<Actor, "id" | "role"> | null,
  event: {
    action: string;
    entityType: string;
    entityId?: string | null;
    summary?: string | null;
    metadata?: Record<string, unknown> | null;
  },
) {
  await db.insert(auditEvents).values({
    actorId: actor?.id ?? null,
    actorRole: actor?.role ?? "system",
    action: event.action,
    entityType: event.entityType,
    entityId: event.entityId ?? null,
    summary: event.summary ?? null,
    metadata: event.metadata ?? null,
  });
}

export async function recordJobEvent(
  db: DbOrTx,
  actor: Pick<Actor, "id" | "role"> | null,
  event: { jobId: string; type: string; note?: string | null; revisionId?: string | null },
) {
  await db.insert(jobEvents).values({
    jobId: event.jobId,
    revisionId: event.revisionId ?? null,
    type: event.type,
    note: event.note ?? null,
    actorId: actor?.id ?? null,
    actorRole: actor?.role ?? "system",
  });
}
