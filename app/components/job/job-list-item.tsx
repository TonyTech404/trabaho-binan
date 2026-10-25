import { GraduationCap } from "lucide-react";
import { Link } from "react-router";
import { Badge } from "~/components/ui/badge";
import { EDUCATION_LEVELS, label } from "~/lib/labels";
import type { PublicJobCard } from "~/services/public-jobs.server";
import { DeadlineNote } from "./deadline";
import { Fact, JobFactsInline, VerifiedBadge } from "./job-meta";

type Card = Omit<PublicJobCard, "id"> & { id: string };

/**
 * One vacancy in the directory. Reading order follows what people decide on:
 * title, employer, then where, pay and job type; education and the closing
 * date sit on a quieter last line.
 */
export function JobListItem({ job }: { job: Card }) {
  return (
    <li className="relative rounded-lg border border-line bg-surface px-4 py-3.5 transition-colors focus-within:border-pine hover:border-line-strong sm:px-5 sm:py-4">
      <h3 className="text-lg leading-snug font-semibold [overflow-wrap:anywhere] text-ink sm:text-xl sm:leading-snug">
        {/* The ::after overlay makes the whole card the touch target. */}
        <Link
          to={`/jobs/${job.publicId}/${job.slug}`}
          className="line-clamp-3 text-ink no-underline after:absolute after:inset-0 after:rounded-lg after:content-[''] hover:text-pine hover:underline focus-visible:outline-none focus-visible:after:outline-3 focus-visible:after:outline-offset-2 focus-visible:after:outline-focus"
        >
          {job.title}
        </Link>
      </h3>
      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-ink">
        <span className="[overflow-wrap:anywhere]">{job.organizationName}</span>
        {job.organizationVerified ? <VerifiedBadge /> : null}
        {job.organizationType === "agency" ? <Badge variant="neutral">Agency</Badge> : null}
      </p>
      <JobFactsInline job={job} />
      <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-ink-muted">
        <Fact icon={GraduationCap}>
          {label(EDUCATION_LEVELS, job.educationLevel)}
          {job.fieldOfStudy ? `, ${job.fieldOfStudy}` : ""}
        </Fact>
        <DeadlineNote deadlineAt={job.deadlineAt} />
      </div>
    </li>
  );
}
