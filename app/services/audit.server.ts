import { and, count, desc, eq, ilike } from "drizzle-orm";
import type { Database } from "~/db/client.server";
import { auditEvents, users } from "~/db/schema";
import { requireAdmin, type Actor } from "./common.server";

export const AUDIT_PAGE_SIZE = 50;

export async function listAuditEvents(
  db: Database,
  actor: Actor,
  filters: { entityType?: string; action?: string; page?: number },
) {
  requireAdmin(actor);
  const conditions = [];
  if (filters.entityType) conditions.push(eq(auditEvents.entityType, filters.entityType));
  if (filters.action)
    conditions.push(ilike(auditEvents.action, `${filters.action.replace(/[\\%_]/g, "\\$&")}%`));
  const where = conditions.length ? and(...conditions) : undefined;
  const page = Math.max(1, filters.page ?? 1);
  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: auditEvents.id,
        action: auditEvents.action,
        entityType: auditEvents.entityType,
        entityId: auditEvents.entityId,
        summary: auditEvents.summary,
        metadata: auditEvents.metadata,
        actorRole: auditEvents.actorRole,
        actorName: users.name,
        createdAt: auditEvents.createdAt,
      })
      .from(auditEvents)
      .leftJoin(users, eq(users.id, auditEvents.actorId))
      .where(where)
      .orderBy(desc(auditEvents.createdAt))
      .limit(AUDIT_PAGE_SIZE)
      .offset((page - 1) * AUDIT_PAGE_SIZE),
    db.select({ total: count() }).from(auditEvents).where(where),
  ]);
  return { events: rows, total, page, pageCount: Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE)) };
}
