import type { Auth as BetterAuth, BetterAuthOptions } from "better-auth";
import { betterAuth } from "better-auth/minimal";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { and, eq } from "drizzle-orm";
import type { Database } from "~/db/client.server";
import {
  accounts,
  organizationMembers,
  organizations,
  sessions,
  users,
  verifications,
} from "~/db/schema";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "./constants";
import { hashPassword, verifyPassword } from "./password.server";

export const SESSION_COOKIE_PREFIX = "tb";

export interface AuthConfig {
  baseURL: string;
  secret: string;
  secureCookies: boolean;
}

/**
 * Better Auth is used as a server-side library only. Its HTTP handler is not
 * mounted: sign-in, sign-out and password changes go through this app's own
 * route actions, which keeps the public endpoint surface to what we build.
 * Accounts are created only through single-use invitations
 * (see services/account-links.server.ts), so public sign-up is disabled.
 */
function authOptions(db: Database, config: AuthConfig) {
  return {
    appName: "Trabaho Biñan",
    baseURL: config.baseURL,
    secret: config.secret,
    trustedOrigins: [config.baseURL],
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: { user: users, session: sessions, account: accounts, verification: verifications },
    }),
    user: {
      additionalFields: {
        // `input: false` stops these fields from ever being set through auth endpoints.
        role: { type: "string", required: false, input: false, defaultValue: "employer" },
        status: { type: "string", required: false, input: false, defaultValue: "active" },
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      // A fixed seven-day session: signing in again is the only way to extend it.
      disableSessionRefresh: true,
      // No cookie cache: suspensions and role changes take effect immediately.
      cookieCache: { enabled: false },
    },
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: PASSWORD_MIN_LENGTH,
      maxPasswordLength: PASSWORD_MAX_LENGTH,
      revokeSessionsOnPasswordReset: true,
      password: {
        hash: (password) => hashPassword(db, password),
        verify: ({ hash, password }) => verifyPassword(db, hash, password),
      },
    },
    databaseHooks: {
      session: {
        create: {
          // Suspended accounts, and people from suspended organizations,
          // cannot start new sessions.
          async before(session) {
            const [user] = await db
              .select({ status: users.status })
              .from(users)
              .where(eq(users.id, session.userId))
              .limit(1);
            if (user?.status !== "active") return false;
            const [suspendedOrg] = await db
              .select({ id: organizations.id })
              .from(organizationMembers)
              .innerJoin(organizations, eq(organizations.id, organizationMembers.organizationId))
              .where(
                and(
                  eq(organizationMembers.userId, session.userId),
                  eq(organizations.verificationStatus, "suspended"),
                ),
              )
              .limit(1);
            if (suspendedOrg) return false;
          },
        },
      },
    },
    rateLimit: { enabled: false }, // handled by the Workers rate limiting binding
    telemetry: { enabled: false },
    advanced: {
      cookiePrefix: SESSION_COOKIE_PREFIX,
      useSecureCookies: config.secureCookies,
      database: { generateId: "uuid" },
      ipAddress: { disableIpTracking: true },
    },
  } satisfies BetterAuthOptions;
}

export type Auth = BetterAuth<ReturnType<typeof authOptions>>;

export function createAuth(db: Database, config: AuthConfig): Auth {
  return betterAuth(authOptions(db, config));
}
