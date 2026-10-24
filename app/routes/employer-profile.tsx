import { Building2, Globe, Mail, MapPin, Phone, SearchX } from "lucide-react";
import { data, Link } from "react-router";
import { EmptyState } from "~/components/empty-state";
import { JobListItem } from "~/components/job/job-list-item";
import { VerifiedBadge } from "~/components/job/job-meta";
import { JobText } from "~/components/job/job-text";
import { Badge } from "~/components/ui/badge";
import { getServices } from "~/lib/context.server";
import { label, ORGANIZATION_TYPES } from "~/lib/labels";
import { PUBLIC_LIST_TTL_SECONDS, publicCacheControl } from "~/lib/public-cache.server";
import { formatDate } from "~/lib/time";
import { getPublicOrganization } from "~/services/public-jobs.server";
import type { Route } from "./+types/employer-profile";

export async function loader({ params, context }: Route.LoaderArgs) {
  const db = await getServices(context).db();
  const result = await getPublicOrganization(db, params.slug);
  if (!result) throw data("Employer not found", { status: 404 });
  return result;
}

export function headers() {
  return { "Cache-Control": publicCacheControl(PUBLIC_LIST_TTL_SECONDS) };
}

export function meta({ loaderData }: Route.MetaArgs) {
  if (!loaderData) return [{ title: "Employer not found — Trabaho Biñan" }];
  return [
    { title: `${loaderData.organization.name} — jobs on Trabaho Biñan` },
    {
      name: "description",
      content: `Open vacancies from ${loaderData.organization.name} in Biñan, Laguna.`,
    },
  ];
}

export default function EmployerProfile({ loaderData }: Route.ComponentProps) {
  const { organization: org, jobs } = loaderData;
  const office = [org.officeAddress, org.officeBarangay, org.officeCity].filter(Boolean).join(", ");
  return (
    <main id="main" className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <header className="space-y-3">
        <p className="flex items-center gap-2 text-ink-muted">
          <Building2 aria-hidden="true" className="size-5" />
          {label(ORGANIZATION_TYPES, org.type)}
        </p>
        <h1 className="text-3xl font-bold [overflow-wrap:anywhere] sm:text-4xl">{org.name}</h1>
        {org.verificationStatus === "verified" ? (
          <p className="flex flex-wrap items-center gap-2 text-sm text-ink-muted">
            <VerifiedBadge />
            {org.verifiedAt ? `Verified ${formatDate(org.verifiedAt)}. ` : null}
            <Link to="/help#verified" className="link">
              What this means
            </Link>
          </p>
        ) : (
          <Badge variant="neutral">Not verified yet</Badge>
        )}
      </header>

      <section
        aria-label="About"
        className="mt-6 grid gap-6 rounded-lg border border-line bg-surface p-5 sm:grid-cols-[minmax(0,1fr)_16rem]"
      >
        <div>
          {org.description ? (
            <JobText text={org.description} />
          ) : (
            <p className="text-ink-muted">No description provided.</p>
          )}
        </div>
        <ul className="space-y-2 text-[0.9375rem]">
          {office ? (
            <li className="flex gap-2">
              <MapPin aria-hidden="true" className="mt-1 size-4 shrink-0 text-ink-subtle" />
              <span>
                <span className="sr-only">Office: </span>
                {office}
              </span>
            </li>
          ) : null}
          {org.website ? (
            <li className="flex gap-2">
              <Globe aria-hidden="true" className="mt-1 size-4 shrink-0 text-ink-subtle" />
              <a
                href={org.website}
                className="link [overflow-wrap:anywhere]"
                rel="noopener noreferrer nofollow"
                target="_blank"
              >
                {org.website.replace(/^https:\/\//, "")}
              </a>
            </li>
          ) : null}
          {org.publicEmail ? (
            <li className="flex gap-2">
              <Mail aria-hidden="true" className="mt-1 size-4 shrink-0 text-ink-subtle" />
              <a href={`mailto:${org.publicEmail}`} className="link [overflow-wrap:anywhere]">
                {org.publicEmail}
              </a>
            </li>
          ) : null}
          {org.publicPhone ? (
            <li className="flex gap-2">
              <Phone aria-hidden="true" className="mt-1 size-4 shrink-0 text-ink-subtle" />
              <a href={`tel:${org.publicPhone.replace(/[^0-9+]/g, "")}`} className="link">
                {org.publicPhone}
              </a>
            </li>
          ) : null}
        </ul>
      </section>

      <section aria-labelledby="jobs-heading" className="mt-8">
        <h2 id="jobs-heading" className="text-2xl font-bold">
          {jobs.length === 1 ? "1 open job" : `${jobs.length} open jobs`}
        </h2>
        {jobs.length ? (
          <ul className="mt-4 space-y-3">
            {jobs.map((job) => (
              <JobListItem key={job.id} job={job} />
            ))}
          </ul>
        ) : (
          <EmptyState
            className="mt-4"
            icon={SearchX}
            title="No open jobs from this employer right now"
          >
            <p>
              <Link to="/" className="link">
                Browse all open jobs
              </Link>
            </p>
          </EmptyState>
        )}
      </section>
    </main>
  );
}
