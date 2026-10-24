import { CircleCheck } from "lucide-react";
import { data, Form, Link, useNavigation } from "react-router";
import { ErrorSummary, Field } from "~/components/form/field";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { Button, buttonVariants } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Textarea } from "~/components/ui/textarea";
import { getServices } from "~/lib/context.server";
import { REPORT_REASONS } from "~/lib/labels";
import { withinRateLimit } from "~/lib/rate-limit.server";
import { fieldErrors, formToObject, type FieldErrors } from "~/lib/validation";
import { getPublicJob } from "~/services/public-jobs.server";
import { createReport, reportInputSchema } from "~/services/reports.server";
import type { Route } from "./+types/report";

export const meta = () => [
  { title: "Report a listing — Trabaho Biñan" },
  { name: "robots", content: "noindex" },
];

export async function loader({ params, context }: Route.LoaderArgs) {
  const db = await getServices(context).db();
  const result = await getPublicJob(db, params.publicId);
  if (!result) throw data("Job not found", { status: 404 });
  return {
    job: { publicId: result.job.publicId, slug: result.job.slug, title: result.job.title },
    organizationName: result.organization.name,
  };
}

export async function action({ params, request, context }: Route.ActionArgs) {
  const services = getServices(context);
  const form = await request.formData();
  // Hidden from people; bots that fill every field are quietly ignored.
  if (String(form.get("website") ?? "")) return { sent: true };
  if (!(await withinRateLimit(services.env.FORM_LIMITER, request, "report"))) {
    return data(
      {
        errors: {
          form: "Too many reports from this connection. Wait a minute and try again.",
        } as FieldErrors,
      },
      { status: 429 },
    );
  }
  const parsed = reportInputSchema.safeParse(formToObject(form));
  if (!parsed.success) return data({ errors: fieldErrors(parsed.error) }, { status: 400 });
  const db = await services.db();
  await createReport(db, params.publicId, parsed.data);
  return { sent: true };
}

export default function ReportListing({ loaderData, actionData }: Route.ComponentProps) {
  const { job, organizationName } = loaderData;
  const navigation = useNavigation();
  const jobPath = `/jobs/${job.publicId}/${job.slug}`;
  const errors = actionData && "errors" in actionData ? actionData.errors : undefined;

  return (
    <main id="main" className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <h1 className="text-3xl font-bold">Report a problem with a listing</h1>
      <p className="mt-2 text-lg text-ink-muted">
        <Link to={jobPath} className="link [overflow-wrap:anywhere]">
          {job.title}
        </Link>{" "}
        from {organizationName}
      </p>

      {actionData && "sent" in actionData ? (
        <div className="mt-6 space-y-5">
          <Alert variant="success" tabIndex={-1}>
            <CircleCheck aria-hidden="true" />
            <AlertTitle>Thank you. Your report was sent.</AlertTitle>
            <AlertDescription>
              The review team will check the listing. If it may be a scam, it can be taken down
              while it is investigated.
            </AlertDescription>
          </Alert>
          <Link to="/" className={buttonVariants({ variant: "outline" })}>
            Back to jobs
          </Link>
        </div>
      ) : (
        <Form method="post" className="mt-6 space-y-6" noValidate>
          <ErrorSummary
            errors={errors}
            labels={{ reason: "Reason", details: "Details", reporterContact: "Contact" }}
          />
          <fieldset
            className="space-y-2"
            aria-describedby={errors?.reason ? "reason-error" : undefined}
          >
            <legend className="text-sm font-semibold">What is wrong with this listing?</legend>
            {errors?.reason ? (
              <p id="reason-error" className="text-sm font-semibold text-danger">
                {errors.reason}
              </p>
            ) : null}
            <div id="field-reason" className="space-y-2">
              {Object.entries(REPORT_REASONS).map(([value, text]) => (
                <label
                  key={value}
                  className="flex min-h-12 cursor-pointer items-center gap-3 rounded-md border border-line bg-surface px-3 py-2 has-checked:border-pine has-checked:bg-pine-tint"
                >
                  <input
                    type="radio"
                    name="reason"
                    value={value}
                    className="size-5 accent-pine"
                    required
                  />
                  <span>{text}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <Field
            name="details"
            label="Details"
            optional
            hint="What happened? For example, who asked for money and how."
            error={errors?.details}
          >
            {(p) => <Textarea {...p} rows={4} maxLength={2000} />}
          </Field>
          <Field
            name="reporterContact"
            label="Your email or phone number"
            optional
            hint="Only if you want the review team to follow up with you. It is not shown publicly and is erased once the report is closed."
            error={errors?.reporterContact}
          >
            {(p) => <Input {...p} autoComplete="email" maxLength={200} />}
          </Field>
          <div aria-hidden="true" className="hidden">
            <label>
              Website
              <input type="text" name="website" tabIndex={-1} autoComplete="off" />
            </label>
          </div>
          <Button type="submit" disabled={navigation.state === "submitting"}>
            Send report
          </Button>
        </Form>
      )}
    </main>
  );
}
