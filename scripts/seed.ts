/**
 * Loads clearly labelled SYNTHETIC demo data for development, tests and staging.
 *
 *   SEED_PASSWORD='…' DATABASE_URL=postgres://… npm run db:seed [-- --reset]
 *
 * Refuses to run against a database whose `environment` setting is
 * "production". All organisations are fictional and marked "(Demo)"; all
 * accounts use the reserved example.test domain.
 */
import { eq, sql } from "drizzle-orm";
import * as schema from "~/db/schema";
import { addDaysToDateString, endOfManilaDay, manilaDateString } from "~/lib/time";
import { jobInputSchema } from "~/lib/validation";
import { acceptInvitation, createInvitation } from "~/services/account-links.server";
import type { Actor } from "~/services/common.server";
import {
  approveJob,
  closeJob,
  createJob,
  expireDueJobs,
  proposeRevision,
  requestJobChanges,
  submitJob,
} from "~/services/jobs.server";
import { createOrganization, setOrganizationVerification } from "~/services/organizations.server";
import { createReport } from "~/services/reports.server";
import { connect, getEnvironmentMarker } from "./lib/db";

const SAMPLE_NOTE =
  "Sample listing for demonstration and testing only. This is not a real vacancy.";

async function main() {
  const password = process.env.SEED_PASSWORD;
  if (!password || password.length < 10) {
    console.error("Set SEED_PASSWORD (at least 10 characters) for the demo accounts.");
    process.exit(1);
  }
  const { db, pool, host } = connect("DATABASE_URL");
  try {
    const marker = await getEnvironmentMarker(db);
    if (marker === "production") {
      console.error(`Refusing to seed ${host}: it is marked as production.`);
      process.exit(1);
    }
    if (process.argv.includes("--reset")) {
      await db.execute(sql`
        truncate table audit_events, job_metrics_daily, listing_reports, job_events, job_revisions,
          jobs, account_links, organization_members, organizations, sessions, accounts,
          verifications, users, settings restart identity cascade`);
      console.log("Cleared existing data.");
    }
    const [existing] = await db.select({ id: schema.users.id }).from(schema.users).limit(1);
    if (existing) {
      console.error("Database already has users. Re-run with --reset to replace all data.");
      process.exit(1);
    }

    await db
      .insert(schema.settings)
      .values({ key: "environment", value: process.env.SEED_ENVIRONMENT ?? "development" })
      .onConflictDoNothing();

    const now = new Date();
    const today = manilaDateString(now);
    const inDays = (n: number) => addDaysToDateString(today, n);

    // Accounts --------------------------------------------------------------
    const adminInvite = await createInvitation(db, null, {
      email: "admin@example.test",
      role: "admin",
    });
    const adminUser = await acceptInvitation(db, adminInvite.token, {
      name: "Demo Administrator",
      password,
    });
    const admin: Actor = { id: adminUser.id, role: "admin", organizationId: null };

    const reviewerInvite = await createInvitation(db, admin, {
      email: "reviewer@example.test",
      role: "reviewer",
    });
    const reviewerUser = await acceptInvitation(db, reviewerInvite.token, {
      name: "Demo Reviewer",
      password,
    });
    const reviewer: Actor = { id: reviewerUser.id, role: "reviewer", organizationId: null };

    // Organisations ---------------------------------------------------------
    const org = async (
      name: string,
      type: "direct_employer" | "agency",
      office: { city: string; barangay?: string },
      verified: boolean,
      description: string,
    ) => {
      const created = await createOrganization(db, reviewer, {
        name,
        type,
        description: `${description} (Fictional organization for demonstration.)`,
        website: null,
        publicEmail: null,
        publicPhone: null,
        officeCity: office.city,
        officeBarangay: office.barangay ?? null,
        officeAddress: null,
        internalNotes: "Synthetic demo record.",
      });
      if (verified)
        await setOrganizationVerification(
          db,
          reviewer,
          created.id,
          "verified",
          "Demo verification",
        );
      return created;
    };

    const bakeshop = await org(
      "Sample Bakeshop (Demo)",
      "direct_employer",
      { city: "Biñan", barangay: "Poblacion" },
      true,
      "Neighbourhood bakery supplying pandesal and pastries.",
    );
    const logistics = await org(
      "Demo Logistics Hub",
      "direct_employer",
      { city: "Biñan", barangay: "Canlalay" },
      true,
      "Warehousing and last-mile delivery for local retailers.",
    );
    const agency = await org(
      "Example Staffing Services (Demo Agency)",
      "agency",
      { city: "Santa Rosa" },
      false,
      "Recruitment agency placing staff with client companies in Laguna.",
    );
    const factory = await org(
      "Placeholder Manufacturing Co. (Demo)",
      "direct_employer",
      { city: "Biñan", barangay: "Platero" },
      true,
      "Light manufacturing and packaging.",
    );
    const cafe = await org(
      "Test Café & Kitchen (Demo)",
      "direct_employer",
      { city: "Biñan", barangay: "San Antonio" },
      false,
      "Small café and kitchen.",
    );

    const employerA = await invitedEmployer(
      db,
      reviewer,
      "employer.a@example.test",
      "Demo Employer A",
      logistics.id,
      password,
    );
    const employerB = await invitedEmployer(
      db,
      reviewer,
      "employer.b@example.test",
      "Demo Employer B",
      cafe.id,
      password,
    );

    // Jobs ------------------------------------------------------------------
    const parse = (input: Record<string, unknown>) => jobInputSchema({ now }).parse(input);
    const base = {
      workSetup: "on_site",
      workCity: "Biñan",
      sourceReference: "Synthetic seed data",
      contactName: "Demo Contact",
    };
    const make = async (
      organizationId: string,
      input: Record<string, unknown>,
      actor: Actor = reviewer,
    ) => createJob(db, actor, parse({ ...base, ...input }), { organizationId });
    const publish = async (organizationId: string, input: Record<string, unknown>) => {
      const job = await make(organizationId, input);
      return approveJob(db, reviewer, job.id);
    };

    await publish(bakeshop.id, {
      title: "Cashier",
      description: `${SAMPLE_NOTE}\n\nHandle customer payments, keep the counter tidy and help pack orders during peak hours.\n- Morning or afternoon shift\n- Training provided`,
      qualifications: "Basic math skills. Friendly with customers.",
      skills: "cash handling, customer service",
      educationLevel: "high_school",
      experienceLevel: "none",
      employmentType: "full_time",
      workBarangay: "Poblacion",
      salaryMin: "500",
      salaryMax: "610",
      salaryPeriod: "day",
      openings: "2",
      walkInInstructions:
        "Walk in Monday to Friday, 9:00 AM–3:00 PM. Ask for the store supervisor.",
      applicationNotes: "Bring a printed résumé or biodata and one valid ID.",
      deadline: inDays(20),
    });
    const operator = await publish(factory.id, {
      title: "Production Operator",
      description: `${SAMPLE_NOTE}\n\nOperate packaging machines, check product quality and follow safety procedures on the production floor.`,
      qualifications: "Willing to work on rotating shifts.",
      skills: "machine operation, quality checks",
      educationLevel: "senior_high",
      experienceLevel: "none",
      employmentType: "contract",
      workBarangay: "Platero",
      salaryMin: "610",
      salaryPeriod: "day",
      openings: "15",
      walkInInstructions:
        "Walk-in interviews every Tuesday and Thursday at the main gate guardhouse, 8:00 AM.",
      applicationNotes: "Bring résumé, valid ID, and SSS/PhilHealth numbers if available.",
      deadline: inDays(30),
    });
    await publish(logistics.id, {
      title: "Warehouse Helper",
      description: `${SAMPLE_NOTE}\n\nLoad and unload deliveries, sort parcels and keep the warehouse organised.`,
      educationLevel: "elementary",
      experienceLevel: "none",
      employmentType: "full_time",
      workBarangay: "Canlalay",
      walkInInstructions: "Walk in at the warehouse office, Monday to Saturday, 8:00 AM–12:00 NN.",
      deadline: inDays(2),
    });
    const rider = await publish(logistics.id, {
      title: "Delivery Rider (Motorcycle)",
      description: `${SAMPLE_NOTE}\n\nDeliver parcels to customers within Biñan and nearby areas using a company-assigned route.`,
      qualifications:
        "Professional driver's license with motorcycle restriction code. Knows Biñan barangays.",
      skills: "driving, navigation",
      educationLevel: "high_school",
      experienceLevel: "under_1_year",
      employmentType: "full_time",
      workBarangay: "Canlalay",
      salaryMin: "18000",
      salaryMax: "22000",
      salaryPeriod: "month",
      openings: "5",
      applicationUrl: "https://example.com/apply/demo-delivery-rider",
      deadline: inDays(25),
    });
    await publish(agency.id, {
      title:
        "Customer Service Representative — English and Tagalog Speaking, Night Shift, Account Assignment Based in Laguna Technopark",
      hiringCompanyName: "Client company (BPO; name disclosed at interview)",
      description: `${SAMPLE_NOTE}\n\nAnswer customer calls and chats for a telecommunications account. Paid training is provided before deployment.\n\nThe agency recruits on behalf of the client company. The workplace is in Santa Rosa, not at the agency office.`,
      qualifications:
        "Good English and Tagalog communication skills. Comfortable with computers and night shifts.",
      skills: "communication, typing, problem solving",
      educationLevel: "college_undergraduate",
      experienceLevel: "1_to_2_years",
      employmentType: "full_time",
      workCity: "Santa Rosa",
      workAddress: "Laguna Technopark",
      salaryMin: "20000",
      salaryMax: "25000",
      salaryPeriod: "month",
      openings: "20",
      applicationEmail: "careers@example.com",
      applicationNotes:
        "Email your résumé with the subject “CSR – Night Shift”. No fees are charged to applicants.",
      deadline: inDays(40),
    });
    await publish(bakeshop.id, {
      title: "Baker Assistant",
      description: `${SAMPLE_NOTE}\n\nPrepare dough, bake bread and pastries, and keep the kitchen clean.`,
      qualifications: "TESDA Bread and Pastry Production NC II is an advantage.",
      educationLevel: "vocational",
      experienceLevel: "under_1_year",
      employmentType: "part_time",
      workBarangay: "Poblacion",
      salaryMin: "450",
      salaryPeriod: "day",
      walkInInstructions: "Visit the bakeshop from 2:00 PM to 5:00 PM and ask for the head baker.",
      deadline: inDays(14),
    });
    await publish(factory.id, {
      title: "Accounting Clerk",
      description: `${SAMPLE_NOTE}\n\nPrepare vouchers, encode invoices and help with monthly reconciliation.`,
      qualifications: "Bachelor's degree in Accountancy, Accounting Technology or related course.",
      skills: "spreadsheets, bookkeeping",
      educationLevel: "college_graduate",
      experienceLevel: "1_to_2_years",
      employmentType: "full_time",
      workBarangay: "Platero",
      salaryMin: "18000",
      salaryPeriod: "month",
      applicationEmail: "hr@example.com",
      deadline: inDays(35),
    });
    await publish(bakeshop.id, {
      title: "Office Assistant Intern (OJT)",
      description: `${SAMPLE_NOTE}\n\nSupport day-to-day office work: filing, encoding orders and answering messages. Suitable for students completing on-the-job training hours.`,
      educationLevel: "college_undergraduate",
      experienceLevel: "none",
      employmentType: "internship",
      workBarangay: "Poblacion",
      applicationEmail: "ojt@example.com",
      applicationNotes: "Include your school endorsement letter and required OJT hours.",
      deadline: inDays(45),
    });
    await publish(factory.id, {
      title: "Machine Maintenance Technician",
      description: `${SAMPLE_NOTE}\n\nPerform preventive maintenance and troubleshoot packaging and filling machines.`,
      qualifications:
        "Graduate of a technical-vocational course in electrical or mechanical maintenance.",
      skills: "electrical troubleshooting, preventive maintenance",
      educationLevel: "vocational",
      experienceLevel: "3_to_5_years",
      employmentType: "full_time",
      workBarangay: "Platero",
      salaryMin: "22000",
      salaryMax: "28000",
      salaryPeriod: "month",
      applicationUrl: "https://example.com/careers/demo-technician",
      deadline: inDays(28),
    });
    await publish(cafe.id, {
      title: "Kitchen Staff",
      description: `${SAMPLE_NOTE}\n\nPrepare ingredients, cook simple dishes and wash up during service.`,
      educationLevel: "high_school",
      experienceLevel: "none",
      employmentType: "part_time",
      workBarangay: "San Antonio",
      walkInInstructions: "Drop by the café after 2:00 PM on weekdays.",
      deadline: inDays(10),
    });

    // Employer-submitted listing waiting for review, with wording to flag.
    const barista = await make(
      cafe.id,
      {
        title: "Barista",
        description: `${SAMPLE_NOTE}\n\nPrepare coffee and drinks, take orders and keep the bar clean.`,
        qualifications: "Female only, 18-25 years old, with pleasing personality.",
        educationLevel: "high_school",
        experienceLevel: "none",
        employmentType: "full_time",
        workBarangay: "San Antonio",
        salaryMin: "15000",
        salaryPeriod: "month",
        walkInInstructions: "Walk in after 2:00 PM.",
        deadline: inDays(21),
      },
      employerB,
    );
    await submitJob(db, employerB, barista.id);

    // Draft by an employer.
    await make(
      logistics.id,
      {
        title: "Inventory Clerk",
        description: `${SAMPLE_NOTE}\n\nRecord stock movements and prepare daily inventory reports.`,
        educationLevel: "senior_high",
        experienceLevel: "under_1_year",
        employmentType: "full_time",
        applicationEmail: "jobs@example.com",
        deadline: inDays(30),
      },
      employerA,
    );

    // Returned for changes.
    const sales = await make(agency.id, {
      title: "Sales Associate",
      description: `${SAMPLE_NOTE}\n\nAssist shoppers and keep displays organised at a mall-based client store.`,
      educationLevel: "high_school",
      experienceLevel: "none",
      employmentType: "contract",
      applicationEmail: "apply@example.com",
      deadline: inDays(30),
    });
    await submitJob(db, reviewer, sales.id);
    await requestJobChanges(
      db,
      reviewer,
      sales.id,
      "Please state the actual workplace and the client store's location.",
    );

    // Closed and expired listings keep their public pages with a notice.
    const packer = await publish(logistics.id, {
      title: "Seasonal Packer",
      description: `${SAMPLE_NOTE}\n\nPack holiday orders for delivery.`,
      educationLevel: "none",
      experienceLevel: "none",
      employmentType: "temporary",
      walkInInstructions: "Walk in at the warehouse office.",
      deadline: inDays(15),
    });
    await closeJob(db, employerA, packer.id, "filled");

    const expired = await publish(factory.id, {
      title: "Quality Inspector",
      description: `${SAMPLE_NOTE}\n\nInspect finished goods against quality standards.`,
      educationLevel: "senior_high",
      experienceLevel: "under_1_year",
      employmentType: "full_time",
      applicationEmail: "qa@example.com",
      deadline: inDays(1),
    });
    await db
      .update(schema.jobs)
      .set({ deadlineAt: endOfManilaDay(inDays(-2)) })
      .where(eq(schema.jobs.id, expired.id));
    await expireDueJobs(db, now);

    // Employer proposes a change to a live listing.
    await proposeRevision(
      db,
      employerA,
      rider.id,
      parse({
        ...base,
        ...pickInput(rider),
        salaryMin: "19000",
        salaryMax: "23000",
        salaryPeriod: "month",
        deadline: inDays(30),
      }),
      "edit",
    );

    await createReport(db, operator.publicId, {
      reason: "scam_or_fee",
      details:
        "Synthetic report: someone claiming to be HR asked for a training fee by text message.",
      reporterContact: null,
    });

    console.log(`Seeded synthetic demo data into ${host}.`);
    console.log(
      "Accounts: admin@example.test, reviewer@example.test, employer.a@example.test, employer.b@example.test",
    );
  } finally {
    await pool.end();
  }
}

async function invitedEmployer(
  db: Parameters<typeof createInvitation>[0],
  reviewer: Actor,
  email: string,
  name: string,
  organizationId: string,
  password: string,
): Promise<Actor> {
  const invite = await createInvitation(db, reviewer, { email, role: "employer", organizationId });
  const user = await acceptInvitation(db, invite.token, { name, password });
  return { id: user.id, role: "employer", organizationId };
}

function pickInput(job: schema.Job): Record<string, unknown> {
  return {
    title: job.title,
    hiringCompanyName: job.hiringCompanyName,
    description: job.description,
    qualifications: job.qualifications,
    skills: job.skills,
    educationLevel: job.educationLevel,
    experienceLevel: job.experienceLevel,
    employmentType: job.employmentType,
    workSetup: job.workSetup,
    workCity: job.workCity,
    workBarangay: job.workBarangay,
    workAddress: job.workAddress,
    openings: job.openings?.toString() ?? "",
    applicationUrl: job.applicationUrl,
    applicationEmail: job.applicationEmail,
    walkInInstructions: job.walkInInstructions,
    applicationNotes: job.applicationNotes,
  };
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
