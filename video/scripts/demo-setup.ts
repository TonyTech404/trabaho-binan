/**
 * Creates (or reuses) the clearly labelled demo accounts and company used to
 * record the demo videos, and saves their passwords to .secrets/demo-accounts.json.
 *
 *   DATABASE_URL=… npx tsx --tsconfig ../tsconfig.cloudflare.json scripts/demo-setup.ts
 *
 * Accounts use reserved example.com addresses. Run demo-cleanup.ts afterwards.
 */
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import * as schema from "~/db/schema";
import { acceptInvitation, createInvitation } from "~/services/account-links.server";
import type { Actor } from "~/services/common.server";
import { createOrganization } from "~/services/organizations.server";
import { connect } from "../../scripts/lib/db";

const SECRETS = new URL("../../.secrets/demo-accounts.json", import.meta.url);
export const DEMO = {
  admin: { email: "demo-admin@example.com", name: "Demo Administrator" },
  reviewer: { email: "demo-reviewer@example.com", name: "Demo Reviewer (PESO)" },
  employer: { email: "demo-employer@example.com", name: "Demo Employer" },
  organization: "Demo Bakeshop (not a real company)",
};

async function main() {
  const { db, pool } = connect("DATABASE_URL");
  const saved = existsSync(SECRETS) ? JSON.parse(readFileSync(SECRETS, "utf8")) : {};
  const password = (saved.password as string) ?? randomBytes(18).toString("base64url");

  async function userId(email: string) {
    const [u] = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.email, email));
    return u?.id ?? null;
  }
  async function ensure(
    who: { email: string; name: string },
    role: "admin" | "reviewer" | "employer",
    inviter: Actor | null,
    organizationId?: string,
  ): Promise<Actor> {
    let id = await userId(who.email);
    if (!id) {
      const { token } = await createInvitation(db, inviter, {
        email: who.email,
        role,
        organizationId,
      });
      id = (await acceptInvitation(db, token, { name: who.name, password })).id;
    }
    // Reactivate if a previous cleanup suspended it.
    await db.update(schema.users).set({ status: "active" }).where(eq(schema.users.id, id));
    return { id, role, organizationId: organizationId ?? null };
  }

  try {
    const admin = await ensure(DEMO.admin, "admin", null);
    await ensure(DEMO.reviewer, "reviewer", admin);
    let [org] = await db
      .select({ id: schema.organizations.id })
      .from(schema.organizations)
      .where(eq(schema.organizations.name, DEMO.organization));
    if (!org) {
      org = await createOrganization(db, admin, {
        name: DEMO.organization,
        type: "direct_employer",
        description:
          "A fictional company used only to record the Trabaho Biñan demo videos. It is not a real employer.",
        website: null,
        publicEmail: null,
        publicPhone: null,
        officeCity: "Biñan",
        officeBarangay: null,
        officeAddress: null,
        internalNotes: "Demo video only. Suspend after recording.",
      });
    }
    await db
      .update(schema.organizations)
      .set({ verificationStatus: "unverified" })
      .where(eq(schema.organizations.id, org.id));
    await ensure(DEMO.employer, "employer", admin, org.id);
    writeFileSync(SECRETS, JSON.stringify({ ...DEMO, password, organizationId: org.id }, null, 2), {
      mode: 0o600,
    });
    console.log("Demo accounts ready; credentials in .secrets/demo-accounts.json");
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
