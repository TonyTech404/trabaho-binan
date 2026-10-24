import { CircleCheck, FileUp } from "lucide-react";
import { data, Form, Link, redirect, useNavigation } from "react-router";
import { ErrorSummary, Field } from "~/components/form/field";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { Button, buttonVariants } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Textarea } from "~/components/ui/textarea";
import { APPLICATION_RETENTION_DAYS } from "~/lib/constants";
import { getServices } from "~/lib/context.server";
import { withinRateLimit } from "~/lib/rate-limit.server";
import { MAX_RESUME_BYTES } from "~/lib/resume";
import { serviceErrorResult } from "~/lib/route-helpers.server";
import {
  applicationInputSchema,
  fieldErrors,
  formToObject,
  type FieldErrors,
} from "~/lib/validation";
import { submitApplication } from "~/services/applications.server";
import { getPublicJob } from "~/services/public-jobs.server";
import type { Route } from "./+types/apply-form";

export const meta = ({ loaderData }: Route.MetaArgs) => [
  { title: `Apply: ${loaderData?.job.title ?? "job"} — Trabaho Biñan` },
  { name: "robots", content: "noindex" },
];

export function headers() {
  return { "Cache-Control": "private, no-store" };
}

export async function loader({ params, context }: Route.LoaderArgs) {
  const db = await getServices(context).db();
  const result = await getPublicJob(db, params.publicId);
  if (!result) throw data("Job not found", { status: 404 });
  const jobPath = `/jobs/${result.job.publicId}/${result.job.slug}`;
  // Only open jobs that take applications here; others keep their own instructions.
  if (result.state !== "open" || !result.job.acceptsApplications) throw redirect(jobPath);
  return {
    job: { publicId: result.job.publicId, title: result.job.title, path: jobPath },
    organizationName: result.organization.name,
  };
}

export async function action({ params, request, context }: Route.ActionArgs) {
  const services = getServices(context);
  const form = await request.formData();
  // Hidden from people; bots that fill every field are quietly ignored.
  if (String(form.get("website") ?? "")) return { sent: true as const, reference: "" };
  if (!(await withinRateLimit(services.env.FORM_LIMITER, request, "apply"))) {
    return data(
      { errors: { form: "Too many attempts from this connection. Wait a minute and try again." } },
      { status: 429 },
    );
  }

  const parsed = applicationInputSchema.safeParse(formToObject(form));
  const file = form.get("resume");
  const errors: FieldErrors = parsed.success ? {} : fieldErrors(parsed.error);
  if (!(file instanceof File) || file.size === 0) {
    errors.resume = "Choose your résumé file.";
  } else if (file.size > MAX_RESUME_BYTES) {
    errors.resume = "Your résumé must be 5 MB or smaller.";
  }
  if (!parsed.success || Object.keys(errors).length > 0 || !(file instanceof File)) {
    return data({ errors }, { status: 400 });
  }

  try {
    const db = await services.db();
    const { reference } = await submitApplication(
      db,
      services.resumes,
      params.publicId,
      parsed.data,
      {
        bytes: new Uint8Array(await file.arrayBuffer()),
        filename: file.name,
      },
    );
    return { sent: true as const, reference };
  } catch (error) {
    return serviceErrorResult(error);
  }
}

const LABELS = {
  fullName: "Full name",
  email: "Email address",
  phone: "Mobile number",
  resume: "Résumé",
  message: "Message",
  consent: "Agreement",
};

export default function ApplyForm({ loaderData, actionData }: Route.ComponentProps) {
  const { job, organizationName } = loaderData;
  const navigation = useNavigation();
  const busy = navigation.state === "submitting";
  const errors =
    actionData && "errors" in actionData ? (actionData.errors as FieldErrors) : undefined;
  const formError = actionData && "error" in actionData ? String(actionData.error) : undefined;
  const retentionMonths = Math.round(APPLICATION_RETENTION_DAYS / 30);

  if (actionData && "sent" in actionData) {
    return (
      <main id="main" className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <Alert variant="success" tabIndex={-1}>
          <CircleCheck aria-hidden="true" />
          <AlertTitle>Your application was sent</AlertTitle>
          <AlertDescription>
            {organizationName} and PESO Biñan can now see your application for {job.title}. If you
            are shortlisted, they will contact you by email or phone.
            {actionData.reference ? (
              <>
                {" "}
                Your reference is <strong className="text-ink">{actionData.reference}</strong>. Keep
                it in case you need to ask about your application.
              </>
            ) : null}
          </AlertDescription>
        </Alert>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link to="/" className={buttonVariants({ variant: "outline" })}>
            Browse more jobs
          </Link>
          <Link to={job.path} className={buttonVariants({ variant: "ghost" })}>
            Back to the job
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main id="main" className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <Link to={job.path} className="link inline-flex min-h-11 items-center">
        Back to the job
      </Link>
      <h1 className="mt-2 text-3xl font-bold [overflow-wrap:anywhere]">Apply for {job.title}</h1>
      <p className="mt-2 text-lg text-ink-muted">
        at {organizationName}. Your application goes to the employer and to PESO Biñan. It is free:
        never pay to apply.
      </p>

      <Form method="post" encType="multipart/form-data" className="mt-6 space-y-6" noValidate>
        {formError ? (
          <Alert variant="danger">
            <AlertTitle>Your application was not sent</AlertTitle>
            <AlertDescription>{formError}</AlertDescription>
          </Alert>
        ) : null}
        <ErrorSummary errors={errors} labels={LABELS} />

        <Field name="fullName" label="Full name" error={errors?.fullName}>
          {(p) => <Input {...p} autoComplete="name" maxLength={120} required />}
        </Field>
        <Field
          name="email"
          label="Email address"
          hint="Give an email address, a mobile number or both."
          error={errors?.email}
        >
          {(p) => <Input {...p} type="email" autoComplete="email" maxLength={254} />}
        </Field>
        <Field name="phone" label="Mobile number" optional error={errors?.phone}>
          {(p) => <Input {...p} type="tel" autoComplete="tel" inputMode="tel" maxLength={40} />}
        </Field>
        <Field
          name="resume"
          label="Résumé"
          hint="PDF or Word file (.pdf, .docx or .doc), up to 5 MB."
          error={errors?.resume}
        >
          {(p) => (
            <div className="flex items-center gap-3 rounded-md border border-dashed border-line-strong bg-wash px-3 py-3">
              <FileUp aria-hidden="true" className="size-5 shrink-0 text-pine" />
              <input
                {...p}
                type="file"
                accept=".pdf,.docx,.doc,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                required
                className="min-w-0 flex-1 text-base file:mr-3 file:min-h-11 file:cursor-pointer file:rounded-md file:border file:border-line-strong file:bg-surface file:px-3 file:font-semibold file:text-ink hover:file:border-ink"
              />
            </div>
          )}
        </Field>
        <Field
          name="message"
          label="Message to the employer"
          optional
          hint="For example, when you can start or which branch you prefer."
          error={errors?.message}
        >
          {(p) => <Textarea {...p} rows={4} maxLength={1000} />}
        </Field>

        <div className="space-y-2">
          {errors?.consent ? (
            <p id="consent-error" className="text-sm font-semibold text-danger">
              {errors.consent}
            </p>
          ) : null}
          <label
            id="field-consent"
            className="flex cursor-pointer gap-3 rounded-md border border-line bg-surface px-3 py-3 has-checked:border-pine has-checked:bg-pine-tint"
          >
            <input
              type="checkbox"
              name="consent"
              required
              aria-describedby={errors?.consent ? "consent-error" : undefined}
              className="mt-1 size-5 shrink-0 accent-pine"
            />
            <span>
              I agree that {organizationName} and PESO Biñan may use the details and résumé I send
              to consider me for this job. They are deleted after about {retentionMonths} months.{" "}
              <Link to="/privacy#applications" className="link">
                How your application is handled
              </Link>
            </span>
          </label>
        </div>

        <div aria-hidden="true" className="hidden">
          <label>
            Website
            <input type="text" name="website" tabIndex={-1} autoComplete="off" />
          </label>
        </div>

        <Button type="submit" size="lg" disabled={busy}>
          {busy ? "Sending…" : "Send application"}
        </Button>
      </Form>
    </main>
  );
}
