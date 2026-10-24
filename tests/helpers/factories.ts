import type { Database } from "~/db/client.server";
import type { UserRole } from "~/db/schema";
import { randomId } from "~/lib/ids";
import { addDaysToDateString, manilaDateString } from "~/lib/time";
import { jobInputSchema, type JobInput } from "~/lib/validation";
import { acceptInvitation, createInvitation } from "~/services/account-links.server";
import type { Actor } from "~/services/common.server";
import { createOrganization } from "~/services/organizations.server";

export const PASSWORD = "correct-horse-battery";

/** Unique, obviously synthetic values so tests never collide. */
export const uid = () => randomId(10);

let bootstrapAdmin: Actor | undefined;

export async function makeUser(
  db: Database,
  role: UserRole,
  options: { organizationId?: string; inviter?: Actor } = {},
): Promise<Actor & { email: string }> {
  const email = `${role}-${uid()}@example.test`;
  const inviter =
    role === "admin" && !options.inviter ? null : (options.inviter ?? (await admin(db)));
  const { token } = await createInvitation(db, inviter, {
    email,
    role,
    organizationId: options.organizationId,
  });
  const user = await acceptInvitation(db, token, { name: `Test ${role}`, password: PASSWORD });
  return { id: user.id, role, organizationId: options.organizationId ?? null, email };
}

export async function admin(db: Database): Promise<Actor> {
  bootstrapAdmin ??= await makeUser(db, "admin");
  return bootstrapAdmin;
}

export async function makeOrganization(
  db: Database,
  actor: Actor,
  type: "direct_employer" | "agency" = "direct_employer",
) {
  return createOrganization(db, actor, {
    name: `Test Employer ${uid()}`,
    type,
    description: null,
    website: null,
    publicEmail: null,
    publicPhone: null,
    officeCity: "Biñan",
    officeBarangay: null,
    officeAddress: null,
    internalNotes: null,
  });
}

export function jobInput(overrides: Record<string, unknown> = {}, now = new Date()): JobInput {
  return jobInputSchema({ now }).parse({
    title: `Test Cashier ${uid()}`,
    description: "Handle payments and help customers at the counter during busy hours.",
    educationLevel: "high_school",
    experienceLevel: "none",
    employmentType: "full_time",
    workSetup: "on_site",
    workCity: "Biñan",
    walkInInstructions: "Walk in Monday to Friday.",
    deadline: addDaysToDateString(manilaDateString(now), 20),
    ...overrides,
  });
}
