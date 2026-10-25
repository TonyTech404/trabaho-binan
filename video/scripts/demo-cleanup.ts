/**
 * Removes the demo data created for the videos: closes and archives the demo
 * jobs, deletes their applications and attached files, and suspends the demo
 * company and accounts (they can be reactivated by demo-setup.ts).
 *
 *   DATABASE_URL=… R2_BUCKET=trabaho-binan-resumes npx tsx --tsconfig ../tsconfig.cloudflare.json scripts/demo-cleanup.ts
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { and, eq, inArray, like } from "drizzle-orm";
import * as schema from "~/db/schema";
import type { Actor } from "~/services/common.server";
import { archiveJob, closeJob } from "~/services/jobs.server";
import { setOrganizationVerification } from "~/services/organizations.server";
import { setUserStatus } from "~/services/users.server";
import { connect } from "../../scripts/lib/db";

const creds = JSON.parse(
  readFileSync(new URL("../../.secrets/demo-accounts.json", import.meta.url), "utf8"),
);
const bucket = process.env.R2_BUCKET;

async function main() {
  const { db, pool } = connect("DATABASE_URL");
  try {
    const demoUsers = await db
      .select({ id: schema.users.id, email: schema.users.email, role: schema.users.role })
      .from(schema.users)
      .where(like(schema.users.email, "demo-%@example.com"));
    const admin = demoUsers.find((u) => u.email === creds.admin.email);
    if (!admin) throw new Error("Demo administrator not found.");
    const actor: Actor = { id: admin.id, role: "admin", organizationId: null };

    const [org] = await db
      .select({ id: schema.organizations.id })
      .from(schema.organizations)
      .where(eq(schema.organizations.name, creds.organization));
    if (!org) throw new Error("Demo organization not found.");
    const demoJobs = await db
      .select({ id: schema.jobs.id, title: schema.jobs.title, status: schema.jobs.status })
      .from(schema.jobs)
      .where(eq(schema.jobs.organizationId, org.id));

    // Applications (including the demo hire, so it drops out of the placement
    // count) and their files.
    const apps = demoJobs.length
      ? await db
          .select({ id: schema.applications.id })
          .from(schema.applications)
          .where(
            inArray(
              schema.applications.jobId,
              demoJobs.map((j) => j.id),
            ),
          )
      : [];
    for (const a of apps) {
      const files = await db
        .select({ key: schema.applicationFiles.key })
        .from(schema.applicationFiles)
        .where(eq(schema.applicationFiles.applicationId, a.id));
      if (bucket) {
        for (const f of files) {
          execFileSync(
            "npx",
            ["wrangler", "r2", "object", "delete", `${bucket}/${f.key}`, "--remote"],
            { stdio: "ignore" },
          );
        }
      }
      await db.delete(schema.applications).where(eq(schema.applications.id, a.id));
    }
    console.log(
      `Deleted ${apps.length} demo application(s)${bucket ? " and their files" : " (files left: no R2_BUCKET)"}.`,
    );

    for (const job of demoJobs) {
      if (job.status === "archived") continue;
      if (job.status === "published" || job.status === "paused") {
        await closeJob(
          db,
          actor,
          job.id,
          "Demo video recording finished. This was not a real vacancy.",
        );
      }
      if (["draft", "pending_review", "changes_requested"].includes(job.status)) {
        await db
          .update(schema.jobs)
          .set({ status: "archived" })
          .where(and(eq(schema.jobs.id, job.id), eq(schema.jobs.organizationId, org.id)));
      } else {
        await archiveJob(db, actor, job.id);
      }
      console.log(`Archived: ${job.title}`);
    }

    await setOrganizationVerification(
      db,
      actor,
      org.id,
      "suspended",
      "Demo company for the videos.",
    );
    for (const u of demoUsers.filter((u) => u.id !== admin.id))
      await setUserStatus(db, actor, u.id, "suspended");
    // The administrator cannot suspend itself through the service; do it directly.
    await db.update(schema.users).set({ status: "suspended" }).where(eq(schema.users.id, admin.id));
    await db.delete(schema.sessions).where(eq(schema.sessions.userId, admin.id));
    console.log("Suspended the demo company and accounts.");
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
