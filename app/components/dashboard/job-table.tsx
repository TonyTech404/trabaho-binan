import { Flag, GitPullRequestArrow } from "lucide-react";
import { Link } from "react-router";
import { formatDate } from "~/lib/time";
import { JobStatusBadge } from "./status";

export interface JobRow {
  id: string;
  title: string;
  status: string;
  deadlineAt: Date | string;
  updatedAt: Date | string;
  organizationName: string;
  hasOpenRevision: boolean;
  openReports: number;
  workCity: string;
  deadlinePassed: boolean;
}

/** Responsive list of jobs: stacked rows on phones, a table-like grid on wide screens. */
export function JobTable({
  jobs,
  basePath,
  showEmployer = true,
}: {
  jobs: JobRow[];
  basePath: string;
  showEmployer?: boolean;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-line bg-surface">
      <div
        className="hidden grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)_9rem_7rem] gap-4 border-b border-line bg-muted px-4 py-2 text-sm font-semibold text-ink-muted md:grid"
        aria-hidden="true"
      >
        <span>Job</span>
        <span>{showEmployer ? "Employer" : "Location"}</span>
        <span>Status</span>
        <span>Closes</span>
      </div>
      <ul className="divide-y divide-line">
        {jobs.map((job) => (
          <li
            key={job.id}
            className="relative grid gap-1 px-4 py-3 hover:bg-canvas md:grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)_9rem_7rem] md:items-center md:gap-4"
          >
            <div className="min-w-0">
              <Link
                to={`${basePath}/${job.id}`}
                className="font-semibold [overflow-wrap:anywhere] text-ink no-underline after:absolute after:inset-0 hover:underline"
              >
                {job.title}
              </Link>
              <div className="mt-0.5 flex flex-wrap gap-2 text-sm">
                {job.hasOpenRevision ? (
                  <span className="inline-flex items-center gap-1 text-lake-strong">
                    <GitPullRequestArrow aria-hidden="true" className="size-4" />
                    Changes pending
                  </span>
                ) : null}
                {job.openReports ? (
                  <span className="inline-flex items-center gap-1 text-danger">
                    <Flag aria-hidden="true" className="size-4" />
                    {job.openReports} open {job.openReports === 1 ? "report" : "reports"}
                  </span>
                ) : null}
              </div>
            </div>
            <span className="text-sm [overflow-wrap:anywhere] text-ink-muted md:text-base md:text-ink">
              {showEmployer ? job.organizationName : job.workCity}
            </span>
            <span>
              <JobStatusBadge status={job.status} deadlinePassed={job.deadlinePassed} />
            </span>
            <span className="text-sm">
              <span className="md:sr-only">Closes </span>
              {formatDate(job.deadlineAt)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
