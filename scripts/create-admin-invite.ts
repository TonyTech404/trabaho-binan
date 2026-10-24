/**
 * Creates a single-use invitation link for the first (or a recovery)
 * administrator. Run by a developer with database owner access.
 *
 *   DATABASE_URL=postgresql://... npm run admin:invite -- \
 *     --email person@example.org --base-url https://trabaho.bantaybinan.com \
 *     [--mark-environment production]
 *
 * The link is written to a private file under .secrets/ (mode 600) instead of
 * the terminal, so it does not end up in shell history or logs. Deliver it to
 * the person through an approved channel; it works once and expires in 7 days.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import * as schema from "~/db/schema";
import { emailSchema } from "~/lib/validation";
import { accountLinkUrl, createInvitation } from "~/services/account-links.server";
import { argValue, connect, getEnvironmentMarker } from "./lib/db";

async function main() {
  const email = emailSchema.safeParse(argValue("email"));
  const baseUrl = argValue("base-url")?.replace(/\/$/, "");
  const marker = argValue("mark-environment");
  if (!email.success || !baseUrl || !/^https?:\/\//.test(baseUrl)) {
    console.error(
      "Usage: npm run admin:invite -- --email <address> --base-url <https://site> [--mark-environment production]",
    );
    process.exit(1);
  }

  const { db, pool, host } = connect("DATABASE_URL");
  try {
    if (marker) {
      const current = await getEnvironmentMarker(db);
      if (current && current !== marker) {
        console.error(
          `Database ${host} is already marked "${current}"; refusing to change it to "${marker}".`,
        );
        process.exit(1);
      }
      await db
        .insert(schema.settings)
        .values({ key: "environment", value: marker })
        .onConflictDoNothing();
    }

    // actor = null is the bootstrap path; it can only create administrator invitations.
    const { link, token } = await createInvitation(db, null, { email: email.data, role: "admin" });
    const url = accountLinkUrl(baseUrl, link, token);

    mkdirSync(".secrets", { recursive: true, mode: 0o700 });
    const file = `.secrets/admin-invite-${new Date().toISOString().replace(/[:.]/g, "-")}.txt`;
    writeFileSync(
      file,
      `Administrator invitation for ${email.data}\nExpires: ${link.expiresAt.toISOString()}\n\n${url}\n`,
      { mode: 0o600 },
    );
    console.log(
      `Invitation for ${email.data} created on ${host}. Link saved to ${file} (single use, 7 days).`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
