import { Link } from "react-router";
import { Badge } from "~/components/ui/badge";
import type { PublicJobCard } from "~/services/public-jobs.server";
import { DeadlineStub } from "./deadline-stub";
import { JobFactsInline, VerifiedBadge } from "./job-meta";

type Card = Omit<PublicJobCard, "id"> & { id: string };

/** One vacancy in the directory: closing-date stub on the left, facts on the right. */
export function JobListItem({ job }: { job: Card }) {
  return (
    <li className="relative flex overflow-hidden rounded-lg border border-line bg-surface transition-colors focus-within:border-lake hover:border-line-strong">
      <DeadlineStub deadlineAt={job.deadlineAt} />
      <div className="min-w-0 flex-1 px-4 py-3">
        <h3 className="text-xl leading-snug font-semibold [overflow-wrap:anywhere] text-ink">
          {/* The ::after overlay makes the whole card the touch target. */}
          <Link
            to={`/jobs/${job.publicId}/${job.slug}`}
            className="line-clamp-3 text-ink no-underline after:absolute after:inset-0 after:content-[''] hover:underline focus-visible:outline-none focus-visible:after:outline-3 focus-visible:after:outline-offset-[-3px] focus-visible:after:outline-focus"
          >
            {job.title}
          </Link>
        </h3>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.9375rem] text-ink">
          <span className="[overflow-wrap:anywhere]">{job.organizationName}</span>
          {job.organizationVerified ? <VerifiedBadge /> : null}
          {job.organizationType === "agency" ? <Badge variant="neutral">Agency</Badge> : null}
        </p>
        <JobFactsInline job={job} />
      </div>
    </li>
  );
}
