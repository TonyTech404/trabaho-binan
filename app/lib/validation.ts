import { z } from "zod";
import {
  EDUCATION_LEVELS,
  EMPLOYMENT_TYPES,
  EXPERIENCE_LEVELS,
  ORGANIZATION_TYPES,
  SALARY_PERIODS,
  WORK_SETUPS,
} from "./labels";
import { addDaysToDateString, endOfManilaDay, manilaDateString } from "./time";

export const DEFAULT_LISTING_DAYS = 30;
export const MAX_LISTING_DAYS = 90;

/** Normalise user-entered text: trim, unify line endings, drop control characters. */
export function cleanText(value: unknown): string {
  if (typeof value !== "string") return "";
  return (
    value
      .replace(/\r\n?/g, "\n")
      // eslint-disable-next-line no-control-regex -- stripping control characters is the point
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}

const requiredText = (min: number, max: number, name: string) =>
  z
    .unknown()
    .transform(cleanText)
    .pipe(
      z
        .string()
        .min(
          min,
          min <= 1 ? `Enter ${name}.` : `${capitalize(name)} must be at least ${min} characters.`,
        )
        .max(max, `${capitalize(name)} must be ${max} characters or fewer.`),
    );

const optionalText = (max: number, name: string) =>
  z
    .unknown()
    .transform((v) => cleanText(v) || null)
    .pipe(
      z
        .string()
        .max(max, `${capitalize(name)} must be ${max} characters or fewer.`)
        .nullable(),
    );

const optionalInt = (min: number, max: number, name: string) =>
  z
    .unknown()
    .transform((v) => {
      const s = cleanText(v).replace(/[,\s₱]/g, "");
      if (!s) return null;
      return /^\d+$/.test(s) ? Number(s) : Number.NaN;
    })
    .pipe(
      z
        .number({ error: `${capitalize(name)} must be a whole number.` })
        .int(`${capitalize(name)} must be a whole number.`)
        .min(min, `${capitalize(name)} must be at least ${min}.`)
        .max(max, `${capitalize(name)} must be at most ${max.toLocaleString("en-PH")}.`)
        .nullable(),
    );

const enumField = <T extends Record<string, string>>(values: T, message: string) =>
  z.enum(Object.keys(values) as [keyof T & string, ...(keyof T & string)[]], { error: message });

export const httpsUrl = z
  .unknown()
  .transform((v) => cleanText(v) || null)
  .pipe(
    z
      .string()
      .max(500, "Link must be 500 characters or fewer.")
      .refine((value) => {
        try {
          const url = new URL(value);
          return (
            url.protocol === "https:" &&
            !url.username &&
            !url.password &&
            url.hostname.includes(".")
          );
        } catch {
          return false;
        }
      }, "Enter a full link that starts with https://")
      .nullable(),
  );

const optionalEmail = z
  .unknown()
  .transform((v) => cleanText(v).toLowerCase() || null)
  .pipe(z.email("Enter a valid email address.").max(254).nullable());

const optionalPhone = z
  .unknown()
  .transform((v) => cleanText(v) || null)
  .pipe(
    z
      .string()
      .max(40)
      .regex(/^[0-9+()\-\s/]{7,40}$/, "Enter a valid phone number.")
      .nullable(),
  );

/**
 * Missing form fields arrive as `undefined`; treat them as empty strings so
 * optional fields become null and required ones get a friendly message.
 */
export function withEmptyDefaults<T extends z.ZodObject>(schema: T) {
  return z.preprocess((value) => {
    const out: Record<string, unknown> = { ...(value as Record<string, unknown>) };
    for (const key of Object.keys(schema.shape)) out[key] ??= "";
    return out;
  }, schema);
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function jobInputSchema(options: { now?: Date; maxListingDays?: number } = {}) {
  const now = options.now ?? new Date();
  const today = manilaDateString(now);
  const latest = addDaysToDateString(today, options.maxListingDays ?? MAX_LISTING_DAYS);

  return withEmptyDefaults(
    z.object({
      title: requiredText(3, 150, "job title"),
      hiringCompanyName: optionalText(120, "hiring company"),
      description: requiredText(20, 5000, "job description"),
      qualifications: optionalText(3000, "qualifications"),
      skills: optionalText(500, "skills"),
      educationLevel: enumField(EDUCATION_LEVELS, "Choose the minimum education."),
      fieldOfStudy: optionalText(120, "course or field of study"),
      experienceLevel: enumField(EXPERIENCE_LEVELS, "Choose the experience required."),
      employmentType: enumField(EMPLOYMENT_TYPES, "Choose the employment type."),
      workSetup: enumField(WORK_SETUPS, "Choose the work setup."),
      workCity: requiredText(2, 80, "city or municipality"),
      workBarangay: optionalText(80, "barangay"),
      workAddress: optionalText(200, "address"),
      salaryMin: optionalInt(1, 10_000_000, "minimum salary"),
      salaryMax: optionalInt(1, 10_000_000, "maximum salary"),
      salaryPeriod: z
        .unknown()
        .transform((v) => cleanText(v) || null)
        .pipe(enumField(SALARY_PERIODS, "Choose how often the salary is paid.").nullable()),
      openings: optionalInt(1, 999, "number of openings"),
      applicationUrl: httpsUrl,
      applicationEmail: optionalEmail,
      walkInInstructions: optionalText(1000, "walk-in instructions"),
      // A checkbox: "on" when ticked, absent when not.
      acceptsApplications: z.unknown().transform((v) => v === true || v === "on" || v === "true"),
      applicationNotes: optionalText(1000, "application notes"),
      deadline: z
        .unknown()
        .transform(cleanText)
        .pipe(
          z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a deadline.")
            .refine((d) => d >= today, "The deadline cannot be in the past.")
            .refine(
              (d) => d <= latest,
              `Listings can stay open for up to ${options.maxListingDays ?? MAX_LISTING_DAYS} days. Choose an earlier deadline.`,
            ),
        ),
      sourceReference: optionalText(300, "source reference"),
      contactName: optionalText(120, "contact name"),
      contactEmail: optionalEmail,
      contactPhone: optionalPhone,
    }),
  )
    .superRefine((v, ctx) => {
      if (v.salaryMin != null && v.salaryMax != null && v.salaryMin > v.salaryMax) {
        ctx.addIssue({
          code: "custom",
          path: ["salaryMax"],
          message: "Maximum salary must be at least the minimum.",
        });
      }
      if ((v.salaryMin != null || v.salaryMax != null) && !v.salaryPeriod) {
        ctx.addIssue({
          code: "custom",
          path: ["salaryPeriod"],
          message: "Choose how often the salary is paid.",
        });
      }
      if (
        !v.acceptsApplications &&
        !v.applicationUrl &&
        !v.applicationEmail &&
        !v.walkInInstructions
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["applicationMethod"],
          message:
            "Give at least one way to apply: applications on Trabaho Biñan, a link, an email address, or walk-in instructions.",
        });
      }
    })
    .transform(({ deadline, salaryPeriod, ...rest }) => ({
      ...rest,
      salaryPeriod: rest.salaryMin != null || rest.salaryMax != null ? salaryPeriod : null,
      deadlineAt: endOfManilaDay(deadline),
    }));
}

export type JobInput = z.output<ReturnType<typeof jobInputSchema>>;

const organizationFields = z.object({
  name: requiredText(2, 120, "organization name"),
  type: enumField(ORGANIZATION_TYPES, "Choose the organization type."),
  description: optionalText(2000, "description"),
  website: httpsUrl,
  publicEmail: optionalEmail,
  publicPhone: optionalPhone,
  officeCity: optionalText(80, "office city"),
  officeBarangay: optionalText(80, "office barangay"),
  officeAddress: optionalText(200, "office address"),
  internalNotes: optionalText(2000, "internal notes"),
});
export const organizationInputSchema = withEmptyDefaults(organizationFields);
export type OrganizationInput = z.output<typeof organizationFields>;

/** Fields an employer may edit on their own organization profile. */
const organizationProfileFields = organizationFields.pick({
  description: true,
  website: true,
  publicEmail: true,
  publicPhone: true,
  officeCity: true,
  officeBarangay: true,
  officeAddress: true,
});
export const organizationProfileSchema = withEmptyDefaults(organizationProfileFields);
export type OrganizationProfileInput = z.output<typeof organizationProfileFields>;

/**
 * Philippine mobile numbers in any common spelling ("0917 123 4567",
 * "+63 917-123-4567", "9171234567") become "+639171234567".
 */
export function normalizePhMobile(value: unknown): string | null {
  const digits = cleanText(value).replace(/[\s().-]/g, "");
  const m = /^(?:\+?63|0)?(9\d{9})$/.exec(digits);
  return m ? `+63${m[1]}` : null;
}

/** "+639171234567" → "0917 123 4567", the way people write it here. */
export function formatPhMobile(value: string): string {
  const m = /^\+63(9\d{2})(\d{3})(\d{4})$/.exec(value);
  return m ? `0${m[1]} ${m[2]} ${m[3]}` : value;
}

/** What an applicant types on the apply form. Files are checked separately. */
export const applicationInputSchema = withEmptyDefaults(
  z.object({
    fullName: requiredText(1, 120, "your full name"),
    phone: z.unknown().transform((v, ctx) => {
      if (!cleanText(v)) {
        ctx.addIssue({ code: "custom", message: "Enter your mobile number." });
        return z.NEVER;
      }
      const phone = normalizePhMobile(v);
      if (!phone) {
        ctx.addIssue({
          code: "custom",
          message: "Enter a mobile number, for example 0917 123 4567.",
        });
        return z.NEVER;
      }
      return phone;
    }),
    email: optionalEmail,
    experience: optionalText(1000, "work experience"),
    message: optionalText(1000, "message"),
    consent: z
      .unknown()
      .refine((v) => v === "on", "Tick the box to agree before you send your application."),
  }),
);
export type ApplicationInput = z.output<typeof applicationInputSchema>;

export const reasonSchema = (name = "reason") => requiredText(3, 1000, name);

export const passwordSchema = (min: number, max: number) =>
  z
    .string()
    .min(min, `Use at least ${min} characters.`)
    .refine((v) => new TextEncoder().encode(v).length <= max, `Use at most ${max} characters.`);

export const personNameSchema = requiredText(2, 100, "your name");
export const emailSchema = z
  .unknown()
  .transform((v) => cleanText(v).toLowerCase())
  .pipe(z.email("Enter a valid email address.").max(254));

export type FieldErrors = Record<string, string | undefined>;

/** First error message per field, for rendering next to form inputs. */
export function fieldErrors(error: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "form";
    out[key] ??= issue.message;
  }
  return out;
}

export function formToObject(formData: FormData): Record<string, FormDataEntryValue> {
  const out: Record<string, FormDataEntryValue> = {};
  for (const [key, value] of formData.entries()) out[key] = value;
  return out;
}
