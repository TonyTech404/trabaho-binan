import { FilePlus2, FileText } from "lucide-react";
import { Link, useSearchParams } from "react-router";
import { JobTable } from "~/components/dashboard/job-table";
import { NoticeBanner } from "~/components/dashboard/notice";
import { PageHeader } from "~/components/dashboard/shell";
import { EmptyState } from "~/components/empty-state";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { buttonVariants } from "~/components/ui/button";
import { getServices } from "~/lib/context.server";
import { requireEmployerViewer } from "~/lib/session.server";
import { listJobsForOrganization } from "~/services/job-queries.server";
import type { Route } from "./+types/index";

export const meta = () => [{ title: "Your jobs — Employer dashboard" }];

export async function loader({ request, context }: Route.LoaderArgs) {
  const viewer = await requireEmployerViewer(request, context);
  const db = await getServices(context).db();
  return {
    organizationName: viewer.organizationName,
    name: viewer.name,
    jobs: await listJobsForOrganization(db, viewer),
  };
}

const GROUPS: { title: string; description: string; statuses: string[] }[] = [
  {
    title: "Needs your action",
    description: "Reviewers asked for changes. Edit and submit again.",
    statuses: ["changes_requested"],
  },
  {
    title: "Drafts",
    description: "Not yet submitted. Only you and reviewers can see them.",
    statuses: ["draft"],
  },
  {
    title: "Waiting for review",
    description: "A reviewer will check these before they are published.",
    statuses: ["pending_review"],
  },
  {
    title: "Live",
    description: "Published and accepting applications. Close a job as soon as it is filled.",
    statuses: ["published", "paused"],
  },
  {
    title: "Closed and expired",
    description: "No longer accepting applications. You can ask to reopen them.",
    statuses: ["closed", "expired", "rejected"],
  },
];

export default function EmployerJobs({ loaderData }: Route.ComponentProps) {
  const { jobs, organizationName, name } = loaderData;
  const [params] = useSearchParams();
  const revisionsPending = jobs.filter((j) => j.hasOpenRevision).length;
  return (
    <>
      <PageHeader
        title="Your jobs"
        description={organizationName}
        actions={
          <Link to="/employer/jobs/new" className={buttonVariants()}>
            <FilePlus2 aria-hidden="true" />
            Post a job
          </Link>
        }
      />
      <NoticeBanner />
      {params.has("welcome") ? (
        <Alert className="mb-5">
          <AlertTitle>Welcome, {name}.</AlertTitle>
          <AlertDescription>
            Post a job and submit it for review. A reviewer checks every listing before it is
            published, and you will see their feedback here.
          </AlertDescription>
        </Alert>
      ) : null}
      {revisionsPending ? (
        <p className="mb-4 text-ink-muted">
          {revisionsPending === 1 ? "1 live listing has" : `${revisionsPending} live listings have`}{" "}
          changes waiting for review.
        </p>
      ) : null}
      {jobs.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No jobs yet"
          actions={
            <Link to="/employer/jobs/new" className={buttonVariants()}>
              Post your first job
            </Link>
          }
        >
          <p>
            Describe the job, how to apply and when applications close. A reviewer checks it before
            it goes live.
          </p>
        </EmptyState>
      ) : (
        <div className="space-y-8">
          {GROUPS.map((g) => {
            const items = jobs.filter((j) => g.statuses.includes(j.status));
            if (!items.length) return null;
            return (
              <section key={g.title} aria-labelledby={`group-${g.statuses[0]}`}>
                <h2 id={`group-${g.statuses[0]}`} className="text-xl font-bold">
                  {g.title}{" "}
                  <span className="font-sans text-base font-normal text-ink-muted">
                    ({items.length})
                  </span>
                </h2>
                <p className="mb-3 text-[0.9375rem] text-ink-muted">{g.description}</p>
                <JobTable jobs={items} basePath="/employer/jobs" showEmployer={false} />
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}
