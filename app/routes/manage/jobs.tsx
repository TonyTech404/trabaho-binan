import { Download, ListChecks, Plus } from "lucide-react";
import { Form, Link, useSearchParams } from "react-router";
import { JobTable } from "~/components/dashboard/job-table";
import { PageHeader } from "~/components/dashboard/shell";
import { EmptyState } from "~/components/empty-state";
import { Pagination } from "~/components/pagination";
import { Button, buttonVariants } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { NativeSelect, NativeSelectOption } from "~/components/ui/native-select";
import { getServices } from "~/lib/context.server";
import { JOB_STATUSES } from "~/lib/labels";
import { requireStaffViewer } from "~/lib/session.server";
import { listJobsForStaff } from "~/services/job-queries.server";
import type { Route } from "./+types/jobs";

export const meta = () => [{ title: "All jobs — Trabaho Biñan" }];

export async function loader({ request, context }: Route.LoaderArgs) {
  const viewer = await requireStaffViewer(request, context);
  const url = new URL(request.url);
  const status = url.searchParams.get("status") ?? "";
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 100);
  const page = Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1;
  const validStatus = status === "active" || Object.hasOwn(JOB_STATUSES, status) ? status : "";
  const db = await getServices(context).db();
  return {
    status: validStatus,
    q,
    result: await listJobsForStaff(db, viewer, { status: validStatus, q, page }),
  };
}

export default function Jobs({ loaderData }: Route.ComponentProps) {
  const { result, status, q } = loaderData;
  const [params] = useSearchParams();
  return (
    <>
      <PageHeader
        title="All jobs"
        description={`${result.total} ${result.total === 1 ? "listing" : "listings"}${status ? "" : " (archived listings hidden)"}.`}
        actions={
          <>
            <a href="/manage/export.csv" className={buttonVariants({ variant: "outline" })}>
              <Download aria-hidden="true" />
              Export CSV
            </a>
            <Link to="/manage/jobs/new" className={buttonVariants()}>
              <Plus aria-hidden="true" />
              Add a vacancy
            </Link>
          </>
        }
      />
      <Form method="get" className="mb-4 flex flex-wrap items-end gap-3">
        <div className="min-w-56 flex-1 space-y-1.5">
          <Label htmlFor="jobs-q">Search</Label>
          <Input
            id="jobs-q"
            name="q"
            type="search"
            defaultValue={q}
            placeholder="Title, employer or job ID"
          />
        </div>
        <div className="w-56 space-y-1.5">
          <Label htmlFor="jobs-status">Status</Label>
          <NativeSelect id="jobs-status" name="status" defaultValue={status}>
            <NativeSelectOption value="">All except archived</NativeSelectOption>
            <NativeSelectOption value="active">Live or paused</NativeSelectOption>
            {Object.entries(JOB_STATUSES).map(([v, l]) => (
              <NativeSelectOption key={v} value={v}>
                {l}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        <Button type="submit" variant="outline">
          Apply
        </Button>
      </Form>
      {result.jobs.length ? (
        <>
          <JobTable jobs={result.jobs} basePath="/manage/jobs" />
          <Pagination page={result.page} pageCount={result.pageCount} searchParams={params} />
        </>
      ) : (
        <EmptyState
          icon={ListChecks}
          title={q || status ? "No listings match" : "No listings yet"}
          actions={
            <Link to="/manage/jobs/new" className={buttonVariants()}>
              Add a vacancy
            </Link>
          }
        >
          <p>
            {q || status
              ? "Try another search or status."
              : "Add a vacancy on behalf of an employer, or invite an employer to submit their own."}
          </p>
        </EmptyState>
      )}
    </>
  );
}
