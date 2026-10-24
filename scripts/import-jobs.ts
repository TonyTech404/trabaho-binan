/**
 * Imports researched vacancies from public sources (government notices and
 * employers' own careers pages) through the normal job services.
 *
 *   DATABASE_URL=postgres://… npm run jobs:import -- data/imports/<file>.json [--dry-run] [--production]
 *
 * Each vacancy is created, submitted and then either published or left in the
 * review queue:
 * - published when the source states a future deadline and the text raises no
 *   policy flags (age, gender, appearance…);
 * - otherwise left as "pending review" for a PESO reviewer to confirm.
 *
 * The actions are recorded under a suspended, non-sign-in staff account named
 * "Listings import", so the audit trail shows they were automated. Re-running
 * the same file skips vacancies that were already imported (matched on the
 * source URL and title).
 */
import { readFileSync } from "node:fs";
import { and, eq, ilike, like } from "drizzle-orm";
import * as schema from "~/db/schema";
import { findPolicyFlags } from "~/lib/policy-flags";
import { jobInputSchema, organizationInputSchema } from "~/lib/validation";
import type { Actor } from "~/services/common.server";
import { approveJob, createJob, submitJob } from "~/services/jobs.server";
import { createOrganization } from "~/services/organizations.server";
import { connect, getEnvironmentMarker } from "./lib/db";

const IMPORT_EMAIL = "listings-import@trabaho-binan.invalid";

interface ImportFile {
  retrievedAt: string;
  jobs: {
    employer: {
      name: string;
      type: "direct_employer" | "agency";
      description: string | null;
      website: string | null;
    };
    job: Record<string, unknown> & { title: string; applicationUrl?: string | null };
    provenance: {
      sourceName: string;
      sourceUrl: string;
      postedDate: string | null;
      deadlineBasis: "stated" | "default_30_days_from_posting";
      evidence?: string;
    };
  }[];
}

async function importActor(db: ReturnType<typeof connect>["db"]): Promise<Actor> {
  const [existing] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, IMPORT_EMAIL))
    .limit(1);
  if (existing) return { id: existing.id, role: "reviewer", organizationId: null };
  const [created] = await db
    .insert(schema.users)
    .values({
      name: "Listings import",
      email: IMPORT_EMAIL,
      role: "reviewer",
      // Suspended accounts cannot sign in or hold sessions; this one only signs audit records.
      status: "suspended",
    })
    .returning({ id: schema.users.id });
  return { id: created.id, role: "reviewer", organizationId: null };
}

function sourceLine(p: ImportFile["jobs"][number]["provenance"], retrievedAt: string) {
  const posted = p.postedDate ? `, posted ${p.postedDate}` : "";
  return `${p.sourceName}${posted}`.slice(0, 200) + ` (retrieved ${retrievedAt})`;
}

async function main() {
  const file = process.argv.slice(2).find((a) => !a.startsWith("--"));
  if (!file) {
    console.error("Usage: npm run jobs:import -- <file.json> [--dry-run] [--production]");
    process.exit(1);
  }
  const dryRun = process.argv.includes("--dry-run");
  const data = JSON.parse(readFileSync(file, "utf8")) as ImportFile;

  const { db, pool, host } = connect("DATABASE_URL");
  try {
    const marker = await getEnvironmentMarker(db);
    if (marker === "production" && !process.argv.includes("--production")) {
      console.error(`${host} is marked as production. Re-run with --production to import there.`);
      process.exit(1);
    }

    const schemaForToday = jobInputSchema();
    const plan: {
      index: number;
      title: string;
      action: "publish" | "review" | "skip";
      why: string;
    }[] = [];
    const actor = dryRun ? null : await importActor(db);
    const orgIds = new Map<string, string>();

    for (const [index, item] of data.jobs.entries()) {
      const { employer, provenance } = item;
      // The schema parses form input, so numbers (salaries, openings) are passed as text.
      const asFormValues = Object.fromEntries(
        Object.entries(item.job).map(([k, v]) => [k, typeof v === "number" ? String(v) : v]),
      );
      const job = {
        ...asFormValues,
        // The original announcement is the authoritative place to apply.
        applicationUrl: item.job.applicationUrl || provenance.sourceUrl,
        // Say where the vacancy was announced, at the end of the description.
        description: [
          item.job.description,
          `Source: ${sourceLine(provenance, data.retrievedAt)}. The application link opens the original announcement; check it before you apply.`,
        ]
          .filter(Boolean)
          .join("\n\n"),
        sourceReference: `${provenance.sourceUrl} (retrieved ${data.retrievedAt})`.slice(0, 300),
      };

      const parsed = schemaForToday.safeParse(job);
      if (!parsed.success) {
        plan.push({
          index,
          title: item.job.title,
          action: "skip",
          why: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
        });
        continue;
      }
      const flags = findPolicyFlags(
        parsed.data.title,
        parsed.data.description,
        parsed.data.qualifications,
      );
      const action =
        provenance.deadlineBasis === "stated" && flags.length === 0 ? "publish" : "review";
      const why =
        flags.length > 0
          ? `policy flags: ${flags.map((f) => f.label).join(", ")}`
          : provenance.deadlineBasis === "stated"
            ? "deadline stated in source"
            : "deadline not stated in source";

      if (dryRun || !actor) {
        plan.push({ index, title: parsed.data.title, action, why });
        continue;
      }

      // Skip vacancies already imported from the same announcement.
      const [dupe] = await db
        .select({ id: schema.jobs.id })
        .from(schema.jobs)
        .where(
          and(
            eq(schema.jobs.title, parsed.data.title),
            like(schema.jobs.sourceReference, `${provenance.sourceUrl}%`),
          ),
        )
        .limit(1);
      if (dupe) {
        plan.push({ index, title: parsed.data.title, action: "skip", why: "already imported" });
        continue;
      }

      let organizationId = orgIds.get(employer.name.toLowerCase());
      if (!organizationId) {
        const [found] = await db
          .select({ id: schema.organizations.id })
          .from(schema.organizations)
          .where(ilike(schema.organizations.name, employer.name))
          .limit(1);
        organizationId =
          found?.id ??
          (
            await createOrganization(
              db,
              actor,
              organizationInputSchema.parse({
                name: employer.name,
                type: employer.type,
                description: employer.description,
                website: employer.website,
                officeCity: "Biñan",
                internalNotes: `Created by the listings import from ${provenance.sourceUrl}. Not verified.`,
              }),
            )
          ).id;
        orgIds.set(employer.name.toLowerCase(), organizationId);
      }

      const created = await createJob(db, actor, parsed.data, { organizationId });
      await submitJob(db, actor, created.id);
      if (action === "publish") {
        await approveJob(
          db,
          actor,
          created.id,
          `Imported from ${provenance.sourceName}; the source states the closing date.`,
        );
      }
      plan.push({ index, title: parsed.data.title, action, why });
    }

    for (const p of plan) {
      console.log(
        `${String(p.index + 1).padStart(2)}. ${p.action.padEnd(7)} ${p.title} (${p.why})`,
      );
    }
    const count = (a: string) => plan.filter((p) => p.action === a).length;
    console.log(
      `${dryRun ? "Dry run: would publish" : "Published"} ${count("publish")}, ${dryRun ? "queue" : "queued for review"} ${count("review")}, skipped ${count("skip")} on ${host}.`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
