import { eq } from "drizzle-orm";
import { redirect, type RouterContextProvider } from "react-router";
import { organizationMembers, organizations, type UserRole } from "~/db/schema";
import type { Actor } from "~/services/common.server";
import { getServices, hasSessionCookie } from "./context.server";

export interface Viewer extends Actor {
  name: string;
  email: string;
  organizationName: string | null;
  organizationSlug: string | null;
}

const viewerCache = new WeakMap<object, Promise<Viewer | null>>();

/**
 * The signed-in user for this request, or null. Visitors without a session
 * cookie never cause a database query. Sessions are read fresh on every
 * request (no cookie cache), so suspensions take effect immediately.
 */
export function getViewer(request: Request, context: Readonly<RouterContextProvider>) {
  const services = getServices(context);
  let pending = viewerCache.get(services);
  if (!pending) {
    pending = loadViewer(request, context);
    viewerCache.set(services, pending);
  }
  return pending;
}

async function loadViewer(
  request: Request,
  context: Readonly<RouterContextProvider>,
): Promise<Viewer | null> {
  if (!hasSessionCookie(request)) return null;
  const services = getServices(context);
  const auth = await services.auth();
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return null;

  const user = session.user as typeof session.user & { role?: string; status?: string };
  if (user.status !== "active") return null;
  const role = user.role as UserRole;
  if (role !== "admin" && role !== "reviewer" && role !== "employer") return null;

  let organizationId: string | null = null;
  let organizationName: string | null = null;
  let organizationSlug: string | null = null;
  if (role === "employer") {
    const db = await services.db();
    const [membership] = await db
      .select({ id: organizations.id, name: organizations.name, slug: organizations.slug })
      .from(organizationMembers)
      .innerJoin(organizations, eq(organizations.id, organizationMembers.organizationId))
      .where(eq(organizationMembers.userId, user.id))
      .limit(1);
    organizationId = membership?.id ?? null;
    organizationName = membership?.name ?? null;
    organizationSlug = membership?.slug ?? null;
  }

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role,
    organizationId,
    organizationName,
    organizationSlug,
  };
}

/** Require a signed-in user, optionally with one of the given roles. */
export async function requireViewer(
  request: Request,
  context: Readonly<RouterContextProvider>,
  roles?: UserRole[],
): Promise<Viewer> {
  const viewer = await getViewer(request, context);
  if (!viewer) {
    const url = new URL(request.url);
    const next = url.pathname + url.search;
    throw redirect(`/login?next=${encodeURIComponent(next)}`);
  }
  if (roles && !roles.includes(viewer.role)) {
    throw new Response("You do not have permission to view this page.", { status: 403 });
  }
  if (viewer.role === "employer" && !viewer.organizationId) {
    throw new Response("Your account is not linked to an organization.", { status: 403 });
  }
  return viewer;
}

export const requireStaffViewer = (request: Request, context: Readonly<RouterContextProvider>) =>
  requireViewer(request, context, ["admin", "reviewer"]);

export const requireAdminViewer = (request: Request, context: Readonly<RouterContextProvider>) =>
  requireViewer(request, context, ["admin"]);

export const requireEmployerViewer = (request: Request, context: Readonly<RouterContextProvider>) =>
  requireViewer(request, context, ["employer"]);

export function dashboardPathFor(role: UserRole) {
  return role === "employer" ? "/employer" : "/manage";
}

/** Only allow same-site relative redirects after sign-in. */
export function safeNextPath(value: string | null | undefined, fallback: string) {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) {
    return fallback;
  }
  return value;
}
