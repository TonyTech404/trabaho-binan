import { SearchCheck } from "lucide-react";
import { data, Form, Link, useNavigation, useSearchParams } from "react-router";
import { Field } from "~/components/form/field";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { getServices } from "~/lib/context.server";
import { APPLICANT_STATUS_TEXT } from "~/lib/labels";
import { withinRateLimit } from "~/lib/rate-limit.server";
import { formatDate, formatDateTime } from "~/lib/time";
import { cleanText } from "~/lib/validation";
import { lookupApplicationStatus } from "~/services/applications.server";
import type { Route } from "./+types/application-status";

export const meta = () => [
  { title: "Check your application — Trabaho Biñan" },
  { name: "robots", content: "noindex" },
];

export function headers() {
  return { "Cache-Control": "private, no-store" };
}

// Posted rather than in the URL, so phone numbers do not end up in history or logs.
export async function action({ request, context }: Route.ActionArgs) {
  const services = getServices(context);
  if (!(await withinRateLimit(services.env.FORM_LIMITER, request, "status"))) {
    return data({ notFound: false, tooMany: true, result: null }, { status: 429 });
  }
  const form = await request.formData();
  const reference = cleanText(form.get("reference"));
  const contact = cleanText(form.get("contact"));
  if (!reference || !contact) {
    return data({ notFound: true, tooMany: false, result: null }, { status: 400 });
  }
  const result = await lookupApplicationStatus(await services.db(), reference, contact);
  return { notFound: !result, tooMany: false, result };
}

export default function ApplicationStatus({ actionData }: Route.ComponentProps) {
  const [params] = useSearchParams();
  const navigation = useNavigation();
  const result = actionData?.result;
  const text = result ? APPLICANT_STATUS_TEXT[result.status] : null;
  const jobOpen = result?.jobStatus === "published";

  return (
    <main id="main" className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <h1 className="text-3xl font-bold">Check your application</h1>
      <p className="mt-2 text-lg text-ink-muted">
        Enter the reference you got when you applied (it starts with TB-) and the mobile number or
        email you applied with.
      </p>

      {result && text ? (
        <section
          aria-labelledby="result-heading"
          className="mt-6 space-y-3 rounded-lg border-2 border-pine bg-surface p-5"
        >
          <p className="text-sm text-ink-muted">Ref. {result.reference}</p>
          <h2 id="result-heading" className="text-2xl font-bold">
            {text.title}
          </h2>
          <p className="text-lg">{text.text}</p>
          <dl className="grid gap-2 border-t border-line pt-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-ink-muted">Job</dt>
              <dd className="font-semibold [overflow-wrap:anywhere]">
                {jobOpen ? (
                  <Link to={`/jobs/${result.jobPublicId}/${result.jobSlug}`} className="link">
                    {result.jobTitle}
                  </Link>
                ) : (
                  result.jobTitle
                )}
              </dd>
            </div>
            <div>
              <dt className="text-ink-muted">Employer</dt>
              <dd className="font-semibold">{result.organizationName}</dd>
            </div>
            <div>
              <dt className="text-ink-muted">Sent</dt>
              <dd className="font-semibold">{formatDate(result.createdAt)}</dd>
            </div>
            <div>
              <dt className="text-ink-muted">Last update</dt>
              <dd className="font-semibold">
                {result.statusUpdatedAt ? formatDateTime(result.statusUpdatedAt) : "No update yet"}
              </dd>
            </div>
          </dl>
          {!jobOpen && (result.status === "submitted" || result.status === "reviewed") ? (
            <p className="text-sm text-ink-muted">This job is no longer taking applications.</p>
          ) : null}
        </section>
      ) : null}

      {actionData?.notFound ? (
        <Alert variant="warning" className="mt-6">
          <SearchCheck aria-hidden="true" />
          <AlertTitle>No application found</AlertTitle>
          <AlertDescription>
            Check the reference and the mobile number or email you used, then try again.
          </AlertDescription>
        </Alert>
      ) : null}
      {actionData?.tooMany ? (
        <Alert variant="danger" className="mt-6">
          <AlertTitle>Too many attempts</AlertTitle>
          <AlertDescription>Wait a minute, then try again.</AlertDescription>
        </Alert>
      ) : null}

      <Form method="post" className="mt-6 space-y-5">
        <Field name="reference" label="Reference">
          {(p) => (
            <Input
              {...p}
              defaultValue={params.get("ref") ?? ""}
              placeholder="TB-"
              autoCapitalize="characters"
              autoComplete="off"
              maxLength={12}
              required
            />
          )}
        </Field>
        <Field name="contact" label="Mobile number or email">
          {(p) => <Input {...p} autoComplete="tel" maxLength={254} required />}
        </Field>
        <Button type="submit" disabled={navigation.state === "submitting"}>
          Check status
        </Button>
      </Form>
    </main>
  );
}
