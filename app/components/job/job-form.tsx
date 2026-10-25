import { Form, useNavigation } from "react-router";
import { ErrorSummary, Field } from "~/components/form/field";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { NativeSelect, NativeSelectOption } from "~/components/ui/native-select";
import { Textarea } from "~/components/ui/textarea";
import {
  EDUCATION_LEVELS,
  EMPLOYMENT_TYPES,
  EXPERIENCE_LEVELS,
  SALARY_PERIODS,
  WORK_SETUPS,
} from "~/lib/labels";
import { addDaysToDateString, manilaDateString } from "~/lib/time";
import { DEFAULT_LISTING_DAYS, MAX_LISTING_DAYS, type FieldErrors } from "~/lib/validation";
import { cn } from "~/lib/utils";

/** Barangays of Biñan, offered as suggestions (any value is accepted). */
const BINAN_BARANGAYS = [
  "Biñan",
  "Bungahan",
  "Canlalay",
  "Casile",
  "De La Paz",
  "Ganado",
  "Langkiwa",
  "Loma",
  "Malaban",
  "Malamig",
  "Mamplasan",
  "Platero",
  "Poblacion",
  "San Antonio",
  "San Francisco",
  "San Jose",
  "San Vicente",
  "Santo Domingo",
  "Santo Niño",
  "Santo Tomas",
  "Soro-soro",
  "Timbao",
  "Tubigan",
  "Zapote",
];

export type JobFormValues = Partial<Record<string, string>>;

/** Turn a stored job (or revision) into string form values. */
export function jobToFormValues(
  job: Record<string, unknown> & { deadlineAt: Date | string },
): JobFormValues {
  const out: JobFormValues = {};
  for (const [k, v] of Object.entries(job)) {
    if (v == null) continue;
    if (typeof v === "string" || typeof v === "number") out[k] = String(v);
    // Checkboxes: "off" (not just missing) so an unticked box stays unticked when editing.
    if (typeof v === "boolean") out[k] = v ? "on" : "off";
  }
  out.deadline = manilaDateString(new Date(job.deadlineAt));
  return out;
}

const LABELS: Record<string, string> = {
  organizationId: "Employer",
  title: "Job title",
  hiringCompanyName: "Hiring company",
  employmentType: "Job type",
  workSetup: "Work setup",
  openings: "Openings",
  workCity: "City or municipality",
  workBarangay: "Barangay",
  workAddress: "Address or landmark",
  description: "Job description",
  qualifications: "Other qualifications",
  skills: "Skills",
  fieldOfStudy: "Course or field of study",
  educationLevel: "Minimum education",
  experienceLevel: "Experience required",
  salaryMin: "Minimum pay",
  salaryMax: "Maximum pay",
  salaryPeriod: "Pay period",
  applicationMethod: "How to apply",
  acceptsApplications: "Applications on Trabaho Biñan",
  applicationUrl: "Application link",
  applicationEmail: "Application email",
  walkInInstructions: "Walk-in instructions",
  applicationNotes: "What to prepare",
  deadline: "Closing date",
  sourceReference: "Source",
  contactName: "Contact name",
  contactEmail: "Contact email",
  contactPhone: "Contact phone",
};

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="space-y-5 rounded-lg border border-line bg-surface p-4 sm:p-5">
      <legend className="float-left mb-4 w-full">
        <span className="text-xl font-bold">{title}</span>
        {description ? (
          <span className="mt-1 block text-[0.9375rem] text-ink-muted">{description}</span>
        ) : null}
      </legend>
      <div className="clear-both space-y-5">{children}</div>
    </fieldset>
  );
}

function Options({ map }: { map: Record<string, string> }) {
  return (
    <>
      {Object.entries(map).map(([v, l]) => (
        <NativeSelectOption key={v} value={v}>
          {l}
        </NativeSelectOption>
      ))}
    </>
  );
}

export interface JobFormProps {
  values?: JobFormValues;
  errors?: FieldErrors;
  /** Staff choose the employer; employers always post for their own organization. */
  organizations?: { id: string; name: string }[];
  /** Show the hiring company field (agencies, or staff who may post for an agency). */
  showHiringCompany?: boolean;
  /** Staff-only internal source reference field. */
  showSource?: boolean;
  actions: {
    name: string;
    value: string;
    label: string;
    variant?: "default" | "outline" | "secondary";
  }[];
  intro?: React.ReactNode;
}

/**
 * The vacancy form shared by reviewers and employers. Server-validated; works
 * without JavaScript. Fields follow the plan's required vacancy information.
 */
export function JobForm({
  values = {},
  errors,
  organizations,
  showHiringCompany,
  showSource,
  actions,
  intro,
}: JobFormProps) {
  const navigation = useNavigation();
  const busy = navigation.state === "submitting";
  const today = manilaDateString();
  const v = (k: string, fallback = "") => values[k] ?? fallback;

  return (
    <Form method="post" className="space-y-6" noValidate>
      <ErrorSummary errors={errors} labels={LABELS} />
      {intro}

      <Section title="The job">
        {organizations ? (
          <Field
            name="organizationId"
            label="Employer"
            error={errors?.organizationId}
            required
            hint="Add the employer first if it is not listed."
          >
            {(p) => (
              <NativeSelect {...p} defaultValue={v("organizationId")}>
                <NativeSelectOption value="">Choose an employer</NativeSelectOption>
                {organizations.map((o) => (
                  <NativeSelectOption key={o.id} value={o.id}>
                    {o.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            )}
          </Field>
        ) : null}
        <Field
          name="title"
          label="Job title"
          hint="One role per listing, in words jobseekers use. Example: Cashier."
          error={errors?.title}
          required
        >
          {(p) => <Input {...p} defaultValue={v("title")} maxLength={150} />}
        </Field>
        {showHiringCompany ? (
          <Field
            name="hiringCompanyName"
            label="Hiring company"
            optional
            hint="For recruitment agencies: the company the person would work for, if it can be disclosed."
            error={errors?.hiringCompanyName}
          >
            {(p) => <Input {...p} defaultValue={v("hiringCompanyName")} maxLength={120} />}
          </Field>
        ) : null}
        <div className="grid gap-5 sm:grid-cols-3">
          <Field name="employmentType" label="Job type" error={errors?.employmentType} required>
            {(p) => (
              <NativeSelect {...p} defaultValue={v("employmentType")}>
                <NativeSelectOption value="">Choose</NativeSelectOption>
                <Options map={EMPLOYMENT_TYPES} />
              </NativeSelect>
            )}
          </Field>
          <Field name="workSetup" label="Work setup" error={errors?.workSetup} required>
            {(p) => (
              <NativeSelect {...p} defaultValue={v("workSetup", "on_site")}>
                <Options map={WORK_SETUPS} />
              </NativeSelect>
            )}
          </Field>
          <Field name="openings" label="Openings" optional error={errors?.openings}>
            {(p) => <Input {...p} defaultValue={v("openings")} inputMode="numeric" />}
          </Field>
        </div>
      </Section>

      <Section
        title="Where the work is"
        description="The actual workplace, not the office where applications are handled."
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <Field name="workCity" label="City or municipality" error={errors?.workCity} required>
            {(p) => <Input {...p} defaultValue={v("workCity", "Biñan")} maxLength={80} />}
          </Field>
          <Field name="workBarangay" label="Barangay" optional error={errors?.workBarangay}>
            {(p) => (
              <>
                <Input {...p} defaultValue={v("workBarangay")} list="barangays" maxLength={80} />
                <datalist id="barangays">
                  {BINAN_BARANGAYS.map((b) => (
                    <option key={b} value={b} />
                  ))}
                </datalist>
              </>
            )}
          </Field>
        </div>
        <Field name="workAddress" label="Address or landmark" optional error={errors?.workAddress}>
          {(p) => <Input {...p} defaultValue={v("workAddress")} maxLength={200} />}
        </Field>
      </Section>

      <Section title="Description and requirements">
        <Field
          name="description"
          label="Job description"
          hint="What the person will do. Start lines with “- ” to make a list. Links are not clickable."
          error={errors?.description}
          required
        >
          {(p) => <Textarea {...p} defaultValue={v("description")} rows={8} maxLength={5000} />}
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            name="educationLevel"
            label="Minimum education"
            error={errors?.educationLevel}
            required
          >
            {(p) => (
              <NativeSelect {...p} defaultValue={v("educationLevel")}>
                <NativeSelectOption value="">Choose</NativeSelectOption>
                <Options map={EDUCATION_LEVELS} />
              </NativeSelect>
            )}
          </Field>
          <Field
            name="fieldOfStudy"
            label="Course or field of study"
            optional
            hint="For jobs that need a degree. Example: BS Accountancy, or Education. Leave blank if any course will do."
            error={errors?.fieldOfStudy}
          >
            {(p) => <Input {...p} defaultValue={v("fieldOfStudy")} maxLength={120} />}
          </Field>
          <Field
            name="experienceLevel"
            label="Experience required"
            error={errors?.experienceLevel}
            required
          >
            {(p) => (
              <NativeSelect {...p} defaultValue={v("experienceLevel")}>
                <NativeSelectOption value="">Choose</NativeSelectOption>
                <Options map={EXPERIENCE_LEVELS} />
              </NativeSelect>
            )}
          </Field>
        </div>
        <Field
          name="skills"
          label="Skills"
          optional
          hint="Separate with commas. Example: cash handling, customer service."
          error={errors?.skills}
        >
          {(p) => <Input {...p} defaultValue={v("skills")} maxLength={500} />}
        </Field>
        <Field
          name="qualifications"
          label="Other qualifications"
          optional
          hint="Licences, certificates or other requirements. Do not ask for age, gender, marital status or appearance unless the job truly requires it; reviewers will check."
          error={errors?.qualifications}
        >
          {(p) => <Textarea {...p} defaultValue={v("qualifications")} rows={4} maxLength={3000} />}
        </Field>
      </Section>

      <Section
        title="Pay"
        description="Leave blank if the pay has not been disclosed. Never estimate it."
      >
        <div className="grid gap-5 sm:grid-cols-3">
          <Field name="salaryMin" label="Minimum (₱)" optional error={errors?.salaryMin}>
            {(p) => <Input {...p} defaultValue={v("salaryMin")} inputMode="numeric" />}
          </Field>
          <Field name="salaryMax" label="Maximum (₱)" optional error={errors?.salaryMax}>
            {(p) => <Input {...p} defaultValue={v("salaryMax")} inputMode="numeric" />}
          </Field>
          <Field name="salaryPeriod" label="Paid" optional error={errors?.salaryPeriod}>
            {(p) => (
              <NativeSelect {...p} defaultValue={v("salaryPeriod")}>
                <NativeSelectOption value="">Choose</NativeSelectOption>
                <Options map={SALARY_PERIODS} />
              </NativeSelect>
            )}
          </Field>
        </div>
      </Section>

      <Section
        title="How to apply"
        description="Give at least one way to apply. Reviewers check links and email addresses before publishing."
      >
        {errors?.applicationMethod ? (
          <p id="field-applicationMethod" className="text-sm font-semibold text-danger">
            {errors.applicationMethod}
          </p>
        ) : null}
        <div className="rounded-md border border-line bg-surface px-3 py-3 has-checked:border-pine has-checked:bg-pine-tint">
          <label className="flex cursor-pointer items-start gap-3 font-semibold">
            <input
              type="checkbox"
              name="acceptsApplications"
              defaultChecked={v("acceptsApplications", "on") === "on"}
              aria-describedby="acceptsApplications-hint"
              className="mt-1 size-5 shrink-0 accent-pine"
            />
            <span>Accept applications on Trabaho Biñan</span>
          </label>
          <p id="acceptsApplications-hint" className="mt-1 pl-8 text-sm text-ink-muted">
            Jobseekers can send their résumé here. You and PESO Biñan see the applications in the
            dashboard. They are deleted after six months.
          </p>
        </div>
        <Field
          name="applicationUrl"
          label="Application link"
          optional
          hint="Must start with https://"
          error={errors?.applicationUrl}
        >
          {(p) => (
            <Input
              {...p}
              type="url"
              inputMode="url"
              defaultValue={v("applicationUrl")}
              placeholder="https://"
              maxLength={500}
            />
          )}
        </Field>
        <Field
          name="applicationEmail"
          label="Application email"
          optional
          hint="A company address, not a personal one where possible."
          error={errors?.applicationEmail}
        >
          {(p) => (
            <Input
              {...p}
              type="email"
              inputMode="email"
              defaultValue={v("applicationEmail")}
              maxLength={254}
            />
          )}
        </Field>
        <Field
          name="walkInInstructions"
          label="Walk-in instructions"
          optional
          hint="Where to go, which days and times, and who to ask for."
          error={errors?.walkInInstructions}
        >
          {(p) => (
            <Textarea {...p} defaultValue={v("walkInInstructions")} rows={3} maxLength={1000} />
          )}
        </Field>
        <Field
          name="applicationNotes"
          label="What to prepare"
          optional
          hint="Documents to bring or include. Example: résumé, valid ID."
          error={errors?.applicationNotes}
        >
          {(p) => (
            <Textarea {...p} defaultValue={v("applicationNotes")} rows={3} maxLength={1000} />
          )}
        </Field>
      </Section>

      <Section
        title="Closing date"
        description={`The listing closes at the end of this day, Philippine time. Up to ${MAX_LISTING_DAYS} days ahead.`}
      >
        <Field name="deadline" label="Closing date" error={errors?.deadline} required>
          {(p) => (
            <Input
              {...p}
              type="date"
              className="sm:max-w-xs"
              min={today}
              max={addDaysToDateString(today, MAX_LISTING_DAYS)}
              defaultValue={v("deadline", addDaysToDateString(today, DEFAULT_LISTING_DAYS))}
            />
          )}
        </Field>
      </Section>

      <Section
        title="Contact for the review team"
        description="Not shown publicly. Used to confirm details and whether the job is still open."
      >
        <div className="grid gap-5 sm:grid-cols-3">
          <Field name="contactName" label="Name" optional error={errors?.contactName}>
            {(p) => (
              <Input {...p} defaultValue={v("contactName")} autoComplete="name" maxLength={120} />
            )}
          </Field>
          <Field name="contactEmail" label="Email" optional error={errors?.contactEmail}>
            {(p) => <Input {...p} type="email" defaultValue={v("contactEmail")} maxLength={254} />}
          </Field>
          <Field name="contactPhone" label="Phone" optional error={errors?.contactPhone}>
            {(p) => <Input {...p} type="tel" defaultValue={v("contactPhone")} maxLength={40} />}
          </Field>
        </div>
        {showSource ? (
          <Field
            name="sourceReference"
            label="Source"
            optional
            hint="Where the vacancy came from. Example: email from HR on 20 Oct."
            error={errors?.sourceReference}
          >
            {(p) => <Input {...p} defaultValue={v("sourceReference")} maxLength={300} />}
          </Field>
        ) : null}
      </Section>

      <div className="sticky bottom-0 -mx-4 flex flex-wrap gap-3 border-t border-line bg-canvas/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-lg sm:border sm:px-4">
        {actions.map((a, i) => (
          <Button
            key={a.value}
            type="submit"
            name={a.name}
            value={a.value}
            variant={a.variant ?? (i === 0 ? "default" : "outline")}
            disabled={busy}
            className={cn(i === 0 && "sm:min-w-44")}
          >
            {a.label}
          </Button>
        ))}
      </div>
    </Form>
  );
}
