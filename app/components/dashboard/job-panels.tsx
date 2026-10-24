import { CircleAlert, ExternalLink, History, TriangleAlert } from "lucide-react";
import { Form, Link, useNavigation } from "react-router";
import { formatLocation } from "~/components/job/job-meta";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { Button, buttonVariants } from "~/components/ui/button";
import { Label } from "~/components/ui/label";
import { Textarea } from "~/components/ui/textarea";
import {
  EDUCATION_LEVELS,
  EMPLOYMENT_TYPES,
  EXPERIENCE_LEVELS,
  formatSalary,
  JOB_EVENT_LABELS,
  label,
  REVISION_KINDS,
  SALARY_PERIODS,
  WORK_SETUPS,
} from "~/lib/labels";
import type { PolicyFlag } from "~/lib/policy-flags";
import { formatDate, formatDateTime } from "~/lib/time";
import { cn } from "~/lib/utils";

export function PolicyFlagsAlert({
  flags,
  audience,
}: {
  flags: PolicyFlag[];
  audience: "staff" | "employer";
}) {
  if (flags.length === 0) return null;
  return (
    <Alert variant="warning">
      <TriangleAlert aria-hidden="true" />
      <AlertTitle>
        {audience === "staff"
          ? "Check this wording before publishing"
          : "Some wording may need to change"}
      </AlertTitle>
      <AlertDescription>
        <ul className="mt-1 space-y-1">
          {flags.map((f) => (
            <li key={f.label}>
              <span className="font-semibold text-ink">{f.label}:</span> “{f.match}”
            </li>
          ))}
        </ul>
        <p className="mt-2">
          Age requirements in job postings are prohibited by Republic Act No. 10911, and applicants
          must not be charged fees. Requirements based on gender, marital status, religion or
          appearance need a genuine job-related reason.
        </p>
      </AlertDescription>
    </Alert>
  );
}

interface TimelineEvent {
  id: string;
  type: string;
  note: string | null;
  createdAt: Date | string;
  actorRole: string | null;
  actorName: string | null;
}

export function JobTimeline({ events }: { events: TimelineEvent[] }) {
  return (
    <section
      aria-labelledby="timeline-heading"
      className="rounded-lg border border-line bg-surface p-4"
    >
      <h2 id="timeline-heading" className="flex items-center gap-2 text-xl font-bold">
        <History aria-hidden="true" className="size-5 text-pine" />
        History
      </h2>
      {events.length === 0 ? (
        <p className="mt-2 text-ink-muted">No activity yet.</p>
      ) : (
        <ol className="mt-3 space-y-0">
          {events.map((e) => (
            <li key={e.id} className="relative border-l-2 border-line py-2 pl-4 last:pb-0">
              <span
                aria-hidden="true"
                className="absolute top-3.5 -left-[5px] size-2 rounded-full bg-pine"
              />
              <p className="font-semibold">{JOB_EVENT_LABELS[e.type] ?? e.type}</p>
              <p className="text-sm text-ink-muted">
                {formatDateTime(e.createdAt)}
                {e.actorName
                  ? `, by ${e.actorName}`
                  : e.actorRole === "system"
                    ? ", automatically"
                    : e.actorRole
                      ? `, by ${e.actorRole === "employer" ? "the employer" : "a reviewer"}`
                      : ""}
              </p>
              {e.note ? (
                <p className="mt-1 rounded-md bg-muted px-3 py-2 whitespace-pre-line">{e.note}</p>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

type ContentLike = Record<string, unknown> & { deadlineAt: Date | string };

const DIFF_FIELDS: {
  key: string;
  label: string;
  format?: (v: unknown, row: ContentLike) => string;
}[] = [
  { key: "title", label: "Job title" },
  { key: "hiringCompanyName", label: "Hiring company" },
  { key: "employmentType", label: "Job type", format: (v) => label(EMPLOYMENT_TYPES, v as string) },
  { key: "workSetup", label: "Work setup", format: (v) => label(WORK_SETUPS, v as string) },
  { key: "workCity", label: "City" },
  { key: "workBarangay", label: "Barangay" },
  { key: "workAddress", label: "Address" },
  { key: "description", label: "Description" },
  { key: "qualifications", label: "Other qualifications" },
  { key: "skills", label: "Skills" },
  {
    key: "educationLevel",
    label: "Education",
    format: (v) => label(EDUCATION_LEVELS, v as string),
  },
  {
    key: "experienceLevel",
    label: "Experience",
    format: (v) => label(EXPERIENCE_LEVELS, v as string),
  },
  { key: "salaryMin", label: "Minimum pay" },
  { key: "salaryMax", label: "Maximum pay" },
  { key: "salaryPeriod", label: "Pay period", format: (v) => label(SALARY_PERIODS, v as string) },
  { key: "openings", label: "Openings" },
  { key: "applicationUrl", label: "Application link" },
  { key: "applicationEmail", label: "Application email" },
  { key: "walkInInstructions", label: "Walk-in instructions" },
  { key: "applicationNotes", label: "What to prepare" },
  { key: "deadlineAt", label: "Closing date", format: (v) => formatDate(v as string) },
  { key: "contactName", label: "Contact name" },
  { key: "contactEmail", label: "Contact email" },
  { key: "contactPhone", label: "Contact phone" },
];

function show(v: unknown, f?: (v: unknown, row: ContentLike) => string, row?: ContentLike) {
  if (v == null || v === "") return "—";
  return f && row ? f(v, row) : String(v);
}

function comparable(v: unknown) {
  if (v instanceof Date) return v.toISOString();
  if (v == null || v === "") return null;
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v)) return new Date(v).toISOString();
  return String(v);
}

/** Field-by-field comparison of a proposed revision against the live listing. */
export function RevisionDiff({ live, proposed }: { live: ContentLike; proposed: ContentLike }) {
  const changed = DIFF_FIELDS.filter(
    (f) => comparable(live[f.key]) !== comparable(proposed[f.key]),
  );
  if (changed.length === 0)
    return (
      <p className="text-ink-muted">No field changes; this is a confirmation or renewal only.</p>
    );
  return (
    <div className="space-y-3">
      {changed.map((f) => (
        <div key={f.key} className="rounded-md border border-line">
          <p className="border-b border-line bg-muted px-3 py-1.5 text-sm font-semibold">
            {f.label}
          </p>
          <div className="grid gap-px bg-line sm:grid-cols-2">
            <div className="bg-surface px-3 py-2">
              <p className="text-xs text-ink-muted">Live now</p>
              <p className="[overflow-wrap:anywhere] whitespace-pre-line">
                {show(live[f.key], f.format, live)}
              </p>
            </div>
            <div className="bg-gold-tint/60 px-3 py-2">
              <p className="text-xs text-ink-muted">Proposed</p>
              <p className="font-semibold [overflow-wrap:anywhere] whitespace-pre-line">
                {show(proposed[f.key], f.format, proposed)}
              </p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function revisionKindLabel(kind: string) {
  return label(REVISION_KINDS, kind);
}

/** An action button; if `reasonLabel` is given, a reason must be written first. */
export function ActionForm({
  intent,
  label: buttonLabel,
  variant = "outline",
  reasonLabel,
  reasonHint,
  hidden,
  confirmLabel,
  children,
}: {
  intent: string;
  label: string;
  variant?: "default" | "outline" | "secondary" | "destructive" | "destructive-outline";
  reasonLabel?: string;
  reasonHint?: string;
  hidden?: Record<string, string>;
  confirmLabel?: string;
  children?: React.ReactNode;
}) {
  const navigation = useNavigation();
  const busy = navigation.state === "submitting" && navigation.formData?.get("intent") === intent;
  const fields = (
    <>
      <input type="hidden" name="intent" value={intent} />
      {Object.entries(hidden ?? {}).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
    </>
  );
  if (!reasonLabel && !children) {
    return (
      <Form method="post">
        {fields}
        <Button type="submit" variant={variant} disabled={busy}>
          {buttonLabel}
        </Button>
      </Form>
    );
  }
  const id = `reason-${intent}`;
  return (
    <details className="group w-full rounded-md open:border open:border-line open:bg-surface open:p-3 sm:w-auto">
      <summary
        className={cn(
          buttonVariants({ variant }),
          "cursor-pointer list-none [&::-webkit-details-marker]:hidden",
        )}
      >
        {buttonLabel}
      </summary>
      <Form method="post" className="mt-3 space-y-3 sm:min-w-80">
        {fields}
        {children}
        {reasonLabel ? (
          <div className="space-y-1.5">
            <Label htmlFor={id}>{reasonLabel}</Label>
            {reasonHint ? <p className="text-sm text-ink-muted">{reasonHint}</p> : null}
            <Textarea id={id} name="reason" required minLength={3} rows={3} />
          </div>
        ) : null}
        <Button type="submit" variant={variant === "outline" ? "default" : variant} disabled={busy}>
          {confirmLabel ?? buttonLabel}
        </Button>
      </Form>
    </details>
  );
}

export function ActionError({ error }: { error?: string }) {
  if (!error) return null;
  return (
    <Alert variant="danger" className="mb-5">
      <CircleAlert aria-hidden="true" />
      <AlertTitle className="font-normal">{error}</AlertTitle>
    </Alert>
  );
}

interface SummaryJob {
  publicId: string;
  slug: string;
  status: string;
  firstPublishedAt: Date | string | null;
  workCity: string;
  workBarangay: string | null;
  workSetup: string;
  employmentType: string;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string;
  salaryPeriod: string | null;
  deadlineAt: Date | string;
  lastConfirmedAt: Date | string | null;
  applicationUrl: string | null;
  applicationEmail: string | null;
  walkInInstructions: string | null;
}

export function JobFactsCard({
  job,
  lastConfirmedByName,
  metrics,
}: {
  job: SummaryJob;
  lastConfirmedByName?: string | null;
  metrics?: { views: number; applyClicks: number };
}) {
  const isPublic = !!job.firstPublishedAt;
  const rows: [string, React.ReactNode][] = [
    ["Location", formatLocation(job)],
    ["Job type", label(EMPLOYMENT_TYPES, job.employmentType)],
    ["Pay", formatSalary(job) ?? "Not disclosed"],
    ["Closing date", formatDate(job.deadlineAt)],
    [
      "Last confirmed open",
      job.lastConfirmedAt
        ? `${formatDate(job.lastConfirmedAt)}${lastConfirmedByName ? ` by ${lastConfirmedByName}` : ""}`
        : "Not yet",
    ],
    [
      "How to apply",
      [
        job.applicationUrl ? "Online link" : null,
        job.applicationEmail ? "Email" : null,
        job.walkInInstructions ? "Walk-in" : null,
      ]
        .filter(Boolean)
        .join(", "),
    ],
  ];
  if (metrics)
    rows.push([
      "Views and apply clicks",
      `${metrics.views} views, ${metrics.applyClicks} apply-link clicks`,
    ]);
  return (
    <section aria-label="Listing facts" className="rounded-lg border border-line bg-surface p-4">
      <dl className="grid gap-y-3 sm:grid-cols-2 sm:gap-x-6 xl:grid-cols-1">
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt className="text-sm text-ink-muted">{k}</dt>
            <dd className="font-semibold [overflow-wrap:anywhere]">{v}</dd>
          </div>
        ))}
      </dl>
      {metrics ? (
        <p className="mt-3 text-xs text-ink-subtle">
          An apply-link click is not a completed application.
        </p>
      ) : null}
      {isPublic ? (
        <Link
          to={`/jobs/${job.publicId}/${job.slug}`}
          className="link mt-3 inline-flex min-h-11 items-center gap-1.5"
          target="_blank"
        >
          View public page
          <ExternalLink aria-hidden="true" className="size-4" />
          <span className="sr-only">(opens in a new tab)</span>
        </Link>
      ) : null}
    </section>
  );
}
