import { CircleCheck, FileUp, Paperclip } from "lucide-react";
import { useState } from "react";
import { data, Form, Link, redirect, useNavigation } from "react-router";
import { ErrorSummary, Field } from "~/components/form/field";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { Button, buttonVariants } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Textarea } from "~/components/ui/textarea";
import { APPLICATION_RETENTION_DAYS } from "~/lib/constants";
import { getServices } from "~/lib/context.server";
import { withinRateLimit } from "~/lib/rate-limit.server";
import { MAX_FILE_BYTES, MAX_FILES } from "~/lib/resume";
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
  // Per connection before the form is read (generous: job fairs share one), then
  // per phone number once the form is valid, so mistakes do not count.
  if (!(await withinRateLimit(services.env.APPLY_LIMITER, request, "apply"))) {
    return data(
      { errors: { form: "Too many attempts from this connection. Wait a minute and try again." } },
      { status: 429 },
    );
  }
  const form = await request.formData();
  // Hidden from people; bots that fill every field are quietly ignored.
  if (String(form.get("website") ?? "")) return { sent: true as const, reference: "" };

  const parsed = applicationInputSchema.safeParse(formToObject(form));
  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  const errors: FieldErrors = parsed.success ? {} : fieldErrors(parsed.error);
  if (files.length > MAX_FILES) errors.files = "Attach up to three files.";
  else if (files.some((f) => f.size > MAX_FILE_BYTES))
    errors.files = "Each file must be 5 MB or smaller.";
  if (!parsed.success || Object.keys(errors).length > 0) {
    return data({ errors }, { status: 400 });
  }
  if (
    !(await withinRateLimit(services.env.FORM_LIMITER, request, "apply-phone", parsed.data.phone))
  ) {
    return data(
      { errors: { form: "Too many applications from this number. Wait a minute and try again." } },
      { status: 429 },
    );
  }

  try {
    const db = await services.db();
    const { reference } = await submitApplication(
      db,
      services.resumes,
      params.publicId,
      parsed.data,
      await Promise.all(
        files.map(async (f) => ({
          bytes: new Uint8Array(await f.arrayBuffer()),
          filename: f.name,
        })),
      ),
    );
    return { sent: true as const, reference };
  } catch (error) {
    return serviceErrorResult(error);
  }
}

const LABELS = {
  fullName: "Full name",
  phone: "Mobile number",
  email: "Email address",
  files: "Résumé or photos",
  experience: "Work experience",
  message: "Message",
  consent: "Agreement",
};

/**
 * Photos are re-drawn in the browser before upload: smaller files on mobile
 * data, the right way up, and without hidden location data. If anything
 * fails, the original goes up and the server strips its metadata instead.
 */
async function shrinkPhoto(file: File): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, "image/jpeg", 0.85));
    if (!blob) return file;
    return new File([blob], `${file.name.replace(/\.[^.]+$/, "") || "photo"}.jpg`, {
      type: "image/jpeg",
    });
  } catch {
    return file;
  }
}

function sizeLabel(bytes: number) {
  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export default function ApplyForm({ loaderData, actionData }: Route.ComponentProps) {
  const { job, organizationName } = loaderData;
  const navigation = useNavigation();
  const [preparing, setPreparing] = useState(false);
  const [chosen, setChosen] = useState<{ name: string; size: number }[]>([]);
  const [fileNote, setFileNote] = useState<string | null>(null);
  const busy = navigation.state === "submitting" || preparing;
  const errors =
    actionData && "errors" in actionData ? (actionData.errors as FieldErrors) : undefined;
  const formError = actionData && "error" in actionData ? String(actionData.error) : undefined;
  const retentionMonths = Math.round(APPLICATION_RETENTION_DAYS / 30);

  async function onFiles(input: HTMLInputElement) {
    const picked = Array.from(input.files ?? []);
    setFileNote(picked.length > MAX_FILES ? "Only the first three files will be sent." : null);
    setPreparing(true);
    try {
      const ready: File[] = [];
      for (const f of picked.slice(0, MAX_FILES)) {
        ready.push(f.type.startsWith("image/") ? await shrinkPhoto(f) : f);
      }
      const transfer = new DataTransfer();
      ready.forEach((f) => transfer.items.add(f));
      input.files = transfer.files;
      setChosen(ready.map((f) => ({ name: f.name, size: f.size })));
    } catch {
      setChosen(picked.map((f) => ({ name: f.name, size: f.size })));
    } finally {
      setPreparing(false);
    }
  }

  if (actionData && "sent" in actionData) {
    return (
      <main id="main" className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <Alert variant="success" tabIndex={-1}>
          <CircleCheck aria-hidden="true" />
          <AlertTitle>Your application was sent</AlertTitle>
          <AlertDescription>
            {organizationName} and PESO Biñan can now see your application for {job.title}. If you
            are shortlisted, they will call or text you.
            {actionData.reference ? (
              <>
                {" "}
                Your reference is <strong className="text-ink">{actionData.reference}</strong>. Keep
                it: you can use it to check your application.
              </>
            ) : null}
          </AlertDescription>
        </Alert>
        <div className="mt-6 flex flex-wrap gap-3">
          {actionData.reference ? (
            <Link
              to={`/application-status?ref=${actionData.reference}`}
              className={buttonVariants({ variant: "outline" })}
            >
              Check your application
            </Link>
          ) : null}
          <Link to="/" className={buttonVariants({ variant: "ghost" })}>
            Browse more jobs
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
        never pay to apply. No résumé? You can still apply.
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
          name="phone"
          label="Mobile number"
          hint="The employer will call or text you on this number. Example: 0917 123 4567"
          error={errors?.phone}
        >
          {(p) => (
            <Input {...p} type="tel" autoComplete="tel" inputMode="tel" maxLength={20} required />
          )}
        </Field>
        <Field name="email" label="Email address" optional error={errors?.email}>
          {(p) => <Input {...p} type="email" autoComplete="email" maxLength={254} />}
        </Field>
        <Field
          name="files"
          label="Résumé or photos"
          optional
          hint="Up to 3 files: a PDF or Word (.docx) résumé, or clear photos of your papers (JPG or PNG). Photos are made smaller and their location data is removed."
          error={errors?.files}
        >
          {(p) => (
            <div className="space-y-2">
              <div className="flex items-center gap-3 rounded-md border border-dashed border-line-strong bg-wash px-3 py-3">
                <FileUp aria-hidden="true" className="size-5 shrink-0 text-pine" />
                <input
                  {...p}
                  type="file"
                  multiple
                  accept="image/*,.pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  onChange={(e) => onFiles(e.currentTarget)}
                  className="min-w-0 flex-1 text-base file:mr-3 file:min-h-11 file:cursor-pointer file:rounded-md file:border file:border-line-strong file:bg-surface file:px-3 file:font-semibold file:text-ink hover:file:border-ink"
                />
              </div>
              {preparing ? <p className="text-sm text-ink-muted">Preparing your photos…</p> : null}
              {fileNote ? <p className="text-sm font-semibold text-gold-ink">{fileNote}</p> : null}
              {chosen.length > 0 && !preparing ? (
                <ul className="space-y-1 text-sm" aria-label="Files to send">
                  {chosen.map((f) => (
                    <li key={f.name} className="flex items-center gap-2">
                      <Paperclip aria-hidden="true" className="size-4 shrink-0 text-ink-subtle" />
                      <span className="[overflow-wrap:anywhere]">{f.name}</span>
                      <span className="text-ink-muted">({sizeLabel(f.size)})</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          )}
        </Field>
        <Field
          name="experience"
          label="Work experience"
          optional
          hint="No résumé? Write your past jobs, how long you worked there, and your skills."
          error={errors?.experience}
        >
          {(p) => <Textarea {...p} rows={4} maxLength={1000} />}
        </Field>
        <Field
          name="message"
          label="Message to the employer"
          optional
          hint="For example, when you can start or which branch you prefer."
          error={errors?.message}
        >
          {(p) => <Textarea {...p} rows={3} maxLength={1000} />}
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
              I agree that {organizationName} and PESO Biñan may use the details and files I send to
              consider me for this job. They are deleted after about {retentionMonths} months.{" "}
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
          {navigation.state === "submitting" ? "Sending…" : "Send application"}
        </Button>
      </Form>
    </main>
  );
}
