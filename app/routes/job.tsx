import {
  ArrowLeft,
  Banknote,
  BriefcaseBusiness,
  Building2,
  CalendarCheck,
  Flag,
  GraduationCap,
  MapPin,
  Share2,
  Timer,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useEffect } from "react";
import { data, Link, redirect } from "react-router";
import { CopyButton } from "~/components/copy-button";
import { ApplyPanel } from "~/components/job/apply-panel";
import { DeadlineNote, isClosingSoon } from "~/components/job/deadline";
import { formatLocation, VerifiedBadge } from "~/components/job/job-meta";
import { JobStatusNotice } from "~/components/job/job-status-notice";
import { JobText } from "~/components/job/job-text";
import { Badge } from "~/components/ui/badge";
import { getServices } from "~/lib/context.server";
import {
  EDUCATION_LEVELS,
  EMPLOYMENT_TYPES,
  EXPERIENCE_LEVELS,
  formatSalary,
  label,
  ORGANIZATION_TYPES,
  WORK_SETUPS,
} from "~/lib/labels";
import {
  PUBLIC_LIST_TTL_SECONDS,
  PUBLIC_PAGE_TTL_SECONDS,
  publicCacheControl,
} from "~/lib/public-cache.server";
import { describeAge, formatDate, formatLongDate } from "~/lib/time";
import { getPublicJob } from "~/services/public-jobs.server";
import type { Route } from "./+types/job";

export async function loader({ params, context }: Route.LoaderArgs) {
  const services = getServices(context);
  const db = await services.db();
  const now = new Date();
  const result = await getPublicJob(db, params.publicId, now);
  if (!result) throw data("Job not found", { status: 404 });

  const canonicalPath = `/jobs/${result.job.publicId}/${result.job.slug}`;
  // Compare route params, not the request path: client navigations request
  // "/jobs/:id/:slug.data", and comparing that path caused a redirect loop.
  if (params.slug !== result.job.slug) {
    throw redirect(canonicalPath, 301);
  }

  // Cache open listings briefly, never past the deadline.
  const secondsLeft = (result.job.deadlineAt.getTime() - now.getTime()) / 1000;
  const cacheControl =
    result.state === "open"
      ? publicCacheControl(PUBLIC_LIST_TTL_SECONDS, secondsLeft)
      : publicCacheControl(PUBLIC_PAGE_TTL_SECONDS);

  return data(
    { ...result, canonicalUrl: `${services.baseUrl}${canonicalPath}` },
    { headers: { "Cache-Control": cacheControl } },
  );
}

export function headers({ loaderHeaders }: Route.HeadersArgs) {
  return { "Cache-Control": loaderHeaders.get("Cache-Control") ?? "no-cache" };
}

export function meta({ loaderData }: Route.MetaArgs) {
  if (!loaderData) return [{ title: "Job not found — Trabaho Biñan" }];
  const { job, organization, state, canonicalUrl } = loaderData;
  const title = `${job.title} at ${organization.name} — Trabaho Biñan`;
  const salary = formatSalary(job);
  const description = [
    `${label(EMPLOYMENT_TYPES, job.employmentType)} in ${formatLocation(job)}.`,
    salary ? `${salary}.` : null,
    state === "open" ? `Apply by ${formatDate(job.deadlineAt)}.` : "This vacancy is closed.",
  ]
    .filter(Boolean)
    .join(" ");
  return [
    { title },
    { name: "description", content: description },
    { property: "og:title", content: `${job.title} — ${organization.name}` },
    { property: "og:description", content: description },
    { property: "og:type", content: "website" },
    { property: "og:url", content: canonicalUrl },
    { tagName: "link", rel: "canonical", href: canonicalUrl },
    ...(state === "open" ? [] : [{ name: "robots", content: "noindex" }]),
  ];
}

const EMPLOYMENT_TYPE_SCHEMA: Record<string, string> = {
  full_time: "FULL_TIME",
  part_time: "PART_TIME",
  contract: "CONTRACTOR",
  temporary: "TEMPORARY",
  internship: "INTERN",
};

const SALARY_UNIT_SCHEMA: Record<string, string> = {
  hour: "HOUR",
  day: "DAY",
  month: "MONTH",
  year: "YEAR",
};

function jobPostingJsonLd(d: Route.ComponentProps["loaderData"]) {
  const { job, organization } = d;
  const posting: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "JobPosting",
    title: job.title,
    description: [job.description, job.qualifications].filter(Boolean).join("\n\n"),
    datePosted: job.firstPublishedAt,
    validThrough: job.deadlineAt,
    employmentType: EMPLOYMENT_TYPE_SCHEMA[job.employmentType],
    hiringOrganization: { "@type": "Organization", name: organization.name },
    jobLocation: {
      "@type": "Place",
      address: {
        "@type": "PostalAddress",
        addressLocality: job.workCity,
        addressRegion: "Laguna",
        addressCountry: "PH",
      },
    },
    directApply: false,
    url: d.canonicalUrl,
  };
  if (job.salaryMin != null || job.salaryMax != null) {
    posting.baseSalary = {
      "@type": "MonetaryAmount",
      currency: job.salaryCurrency,
      value: {
        "@type": "QuantitativeValue",
        minValue: job.salaryMin ?? job.salaryMax,
        maxValue: job.salaryMax ?? job.salaryMin,
        unitText: job.salaryPeriod ? SALARY_UNIT_SCHEMA[job.salaryPeriod] : undefined,
      },
    };
  }
  // Escape "<" so the JSON can never close the script element.
  return JSON.stringify(posting).replace(/</g, "\\u003c");
}

function FactRow({
  icon: Icon,
  term,
  children,
}: {
  icon: LucideIcon;
  term: string;
  children: React.ReactNode;
}) {
  // dt and dd must be direct children of the group div for a valid <dl>, so
  // the icon sits inside the dt and is positioned against the group.
  return (
    <div className="relative min-w-0 py-3 pl-8">
      <dt className="text-sm text-ink-muted">
        <Icon aria-hidden="true" className="absolute top-3.5 left-0 size-5 text-pine" />
        {term}
      </dt>
      <dd className="font-semibold [overflow-wrap:anywhere] text-ink">{children}</dd>
    </div>
  );
}

export default function JobPage({ loaderData }: Route.ComponentProps) {
  const { job, organization, state, canonicalUrl } = loaderData;
  const open = state === "open";
  const salary = formatSalary(job);
  const isAgency = organization.type === "agency";

  // Count a view once the page is shown in a real browser. Cached pages still
  // count, and crawlers that do not run JavaScript do not.
  useEffect(() => {
    if (open && typeof navigator.sendBeacon === "function") {
      navigator.sendBeacon(`/api/job-view/${job.publicId}`);
    }
  }, [open, job.publicId]);

  return (
    <main id="main" className="pb-24 lg:pb-0">
      {open ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jobPostingJsonLd(loaderData) }}
        />
      ) : null}

      <div className="mx-auto max-w-6xl px-4 pt-4 sm:px-6">
        <Link to="/" className="link inline-flex min-h-11 items-center gap-1.5">
          <ArrowLeft aria-hidden="true" className="size-4" />
          All jobs
        </Link>
      </div>

      {/* One apply panel: after the qualifications on small screens, in a sticky side column on wide ones. */}
      <div className="mx-auto grid max-w-6xl gap-x-10 gap-y-6 px-4 pt-2 sm:px-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:grid-rows-[auto_1fr]">
        <div className="min-w-0 space-y-6 lg:col-start-1 lg:row-start-1">
          <header className="space-y-3">
            <JobStatusNotice
              state={state}
              closedReason={job.closedReason}
              closedAt={job.closedAt}
              deadlineAt={job.deadlineAt}
            />
            <h1 className="text-[1.75rem] leading-tight font-bold [overflow-wrap:anywhere] sm:text-3xl lg:text-4xl">
              {job.title}
            </h1>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-lg">
              <span className="inline-flex items-start gap-2 font-semibold [overflow-wrap:anywhere]">
                <Building2 aria-hidden="true" className="mt-1 size-5 shrink-0 text-ink-subtle" />
                {organization.name}
              </span>
              {organization.verificationStatus === "verified" ? <VerifiedBadge /> : null}
              {isAgency ? <Badge variant="neutral">Recruitment agency</Badge> : null}
            </div>
            {isAgency ? (
              <p className="text-ink-muted">
                Hiring for{" "}
                <span className="font-semibold text-ink">
                  {job.hiringCompanyName || "a client company (not named in this listing)"}
                </span>
                . The agency's office is not necessarily where you would work.
              </p>
            ) : null}
          </header>

          <section aria-label="Key facts" className="rounded-lg border border-line bg-surface">
            <dl className="grid divide-y divide-line px-4 sm:grid-cols-2 sm:gap-x-6 sm:divide-y-0">
              <FactRow icon={MapPin} term="Where you will work">
                {formatLocation(job)}
                {job.workAddress ? (
                  <span className="block font-normal text-ink-muted">{job.workAddress}</span>
                ) : null}
              </FactRow>
              <FactRow icon={Banknote} term="Pay">
                {salary ?? <span className="font-normal text-ink-muted">Not disclosed</span>}
              </FactRow>
              <FactRow icon={BriefcaseBusiness} term="Job type">
                {label(EMPLOYMENT_TYPES, job.employmentType)}
                {job.workSetup !== "on_site"
                  ? `, ${label(WORK_SETUPS, job.workSetup).toLowerCase()}`
                  : ""}
              </FactRow>
              <FactRow icon={Users} term="Openings">
                {job.openings ? (
                  `${job.openings} ${job.openings === 1 ? "position" : "positions"}`
                ) : (
                  <span className="font-normal text-ink-muted">Not stated</span>
                )}
              </FactRow>
              <FactRow icon={GraduationCap} term="Education">
                {label(EDUCATION_LEVELS, job.educationLevel)}
              </FactRow>
              <FactRow icon={Timer} term="Experience">
                {label(EXPERIENCE_LEVELS, job.experienceLevel)}
              </FactRow>
            </dl>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-b-lg border-t border-line bg-wash px-4 py-3 text-sm text-ink-muted">
              <p className="inline-flex items-center gap-1.5 text-base text-ink">
                <CalendarCheck aria-hidden="true" className="size-4.5 shrink-0 text-pine" />
                {open ? "Apply by" : "Closing date"}{" "}
                <span className="font-semibold">{formatLongDate(job.deadlineAt)}</span>
              </p>
              {open && isClosingSoon(job.deadlineAt) ? (
                <DeadlineNote deadlineAt={job.deadlineAt} />
              ) : null}
              <p className="basis-full">
                Posted {describeAge(job.firstPublishedAt)}
                {open && job.lastConfirmedAt ? (
                  <>; confirmed open {describeAge(job.lastConfirmedAt)}</>
                ) : null}
              </p>
            </div>
          </section>

          <section aria-labelledby="about-heading" className="space-y-3">
            <h2 id="about-heading" className="text-2xl font-bold">
              About the job
            </h2>
            <JobText text={job.description} />
          </section>

          <section aria-labelledby="qual-heading" className="space-y-3">
            <h2 id="qual-heading" className="text-2xl font-bold">
              Qualifications
            </h2>
            <ul className="prose-job">
              <li>
                <span className="font-semibold">Education:</span>{" "}
                {label(EDUCATION_LEVELS, job.educationLevel)}
              </li>
              <li>
                <span className="font-semibold">Experience:</span>{" "}
                {label(EXPERIENCE_LEVELS, job.experienceLevel)}
              </li>
              {job.skills ? (
                <li>
                  <span className="font-semibold">Skills:</span> {job.skills}
                </li>
              ) : null}
            </ul>
            <JobText text={job.qualifications} />
          </section>
        </div>

        <aside
          aria-label="Application instructions"
          className="lg:col-start-2 lg:row-span-2 lg:row-start-1"
        >
          <div className="lg:sticky lg:top-4">
            <ApplyPanel job={job} open={open} />
          </div>
        </aside>

        <div className="min-w-0 space-y-6 lg:col-start-1 lg:row-start-2">
          <section
            aria-labelledby="employer-heading"
            className="space-y-3 rounded-lg border border-line bg-surface p-4"
          >
            <h2 id="employer-heading" className="text-xl font-bold">
              About the employer
            </h2>
            <p className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">{organization.name}</span>
              <Badge variant="neutral">{label(ORGANIZATION_TYPES, organization.type)}</Badge>
              {organization.verificationStatus === "verified" ? <VerifiedBadge /> : null}
            </p>
            {organization.description ? <JobText text={organization.description} /> : null}
            <p className="text-sm text-ink-muted">
              {organization.verificationStatus === "verified"
                ? "Verified means a reviewer completed the agreed checks on this employer. It is not a guarantee of a job offer."
                : "This employer has not been verified yet. The listing itself was reviewed before publication."}{" "}
              <Link to="/help#verified" className="link">
                How listings are checked
              </Link>
            </p>
            <Link
              to={`/employers/${organization.slug}`}
              className="link inline-flex min-h-11 items-center"
            >
              More from {organization.name}
            </Link>
          </section>

          <section aria-labelledby="share-heading" className="space-y-3">
            <h2 id="share-heading" className="flex items-center gap-2 text-xl font-bold">
              <Share2 aria-hidden="true" className="size-5 text-pine" />
              Share this job
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor="share-url" className="sr-only">
                Link to this job
              </label>
              <input
                id="share-url"
                readOnly
                value={canonicalUrl}
                onFocus={(e) => e.currentTarget.select()}
                className="h-11 min-w-0 flex-1 basis-full rounded-md border border-line bg-muted px-3 text-sm text-ink-muted sm:basis-auto"
              />
              <CopyButton text={canonicalUrl} label="Copy link" />
              <a
                href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(canonicalUrl)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="link inline-flex min-h-11 items-center px-1"
              >
                Share on Facebook
              </a>
            </div>
            <p>
              <Link
                to={`/report/${job.publicId}`}
                className="link inline-flex min-h-11 items-center gap-1.5"
              >
                <Flag aria-hidden="true" className="size-4" />
                Report a problem with this listing
              </Link>
            </p>
          </section>
        </div>
      </div>

      {open ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 px-4 py-3 shadow-[0_-4px_16px_rgba(26,38,32,0.08)] backdrop-blur lg:hidden">
          <div className="mx-auto flex max-w-xl items-center gap-3">
            <p className="flex-1 text-sm leading-tight">
              <CalendarCheck aria-hidden="true" className="mr-1 inline size-4 text-pine" />
              Apply by <span className="font-semibold">{formatDate(job.deadlineAt)}</span>
            </p>
            <a
              href="#how-to-apply"
              className="inline-flex h-11 items-center rounded-md bg-pine px-5 font-semibold text-white no-underline hover:bg-pine-strong"
            >
              How to apply
            </a>
          </div>
        </div>
      ) : null}
    </main>
  );
}
