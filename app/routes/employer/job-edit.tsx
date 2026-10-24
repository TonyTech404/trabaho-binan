import { ArrowLeft } from "lucide-react";
import { data, Link, redirect } from "react-router";
import { ActionError } from "~/components/dashboard/job-panels";
import { PageHeader } from "~/components/dashboard/shell";
import { JobForm, jobToFormValues } from "~/components/job/job-form";
import { Alert, AlertDescription } from "~/components/ui/alert";
import { getServices } from "~/lib/context.server";
import { parseJobForm, serviceErrorResult, withNotice } from "~/lib/route-helpers.server";
import { requireEmployerViewer } from "~/lib/session.server";
import { getJobForActor } from "~/services/job-queries.server";
import { proposeRevision, submitJob, updateJob, type RevisionKind } from "~/services/jobs.server";
import type { Route } from "./+types/job-edit";

export const meta = () => [{ title: "Edit job — Employer dashboard" }];

function revisionKind(request: Request, status: string): RevisionKind | null {
  if (status === "draft" || status === "changes_requested") return null;
  const kind = new URL(request.url).searchParams.get("kind");
  if (status === "closed" || status === "expired") return "reopen";
  return kind === "renewal" ? "renewal" : "edit";
}

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const viewer = await requireEmployerViewer(request, context);
  const db = await getServices(context).db();
  try {
    const { job, organization, openRevision } = await getJobForActor(db, viewer, params.jobId);
    const kind = revisionKind(request, job.status);
    const editable = [
      "draft",
      "changes_requested",
      "published",
      "paused",
      "closed",
      "expired",
    ].includes(job.status);
    if (!editable) throw redirect(`/employer/jobs/${job.id}`);
    return {
      job: { id: job.id, title: job.title, status: job.status },
      kind,
      values: jobToFormValues(kind && openRevision ? openRevision : job),
      isAgency: organization.type === "agency",
    };
  } catch (error) {
    if (error instanceof Response) throw error;
    throw serviceErrorResult(error);
  }
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const viewer = await requireEmployerViewer(request, context);
  const form = await request.formData();
  const parsed = parseJobForm(form);
  if (!parsed.ok)
    return data(
      { errors: parsed.errors, values: parsed.values, error: undefined },
      { status: 400 },
    );
  const db = await getServices(context).db();
  try {
    const { job } = await getJobForActor(db, viewer, params.jobId);
    const kind = revisionKind(request, job.status);
    if (kind) {
      await proposeRevision(db, viewer, job.id, parsed.input, kind);
      return redirect(withNotice(`/employer/jobs/${job.id}`, "revision_submitted"));
    }
    await updateJob(db, viewer, job.id, parsed.input);
    if (form.get("intent") === "submit") {
      await submitJob(db, viewer, job.id);
      return redirect(withNotice(`/employer/jobs/${job.id}`, "submitted"));
    }
    return redirect(withNotice(`/employer/jobs/${job.id}`, "saved"));
  } catch (error) {
    const result = serviceErrorResult(error);
    return data({ ...result.data, values: parsed.values }, { status: result.init?.status ?? 400 });
  }
}

const TITLES = {
  edit: "Change a live listing",
  renewal: "Extend the closing date",
  reopen: "Ask to reopen",
} as const;

export default function EmployerEditJob({ loaderData, actionData }: Route.ComponentProps) {
  const { job, kind } = loaderData;
  return (
    <>
      <PageHeader
        back={
          <Link
            to={`/employer/jobs/${job.id}`}
            className="link inline-flex min-h-11 items-center gap-1.5"
          >
            <ArrowLeft aria-hidden="true" className="size-4" />
            Back to job
          </Link>
        }
        title={kind ? TITLES[kind] : "Edit job"}
        description={job.title}
      />
      {kind ? (
        <Alert variant="info" className="mb-5">
          <AlertDescription className="text-ink">
            {kind === "reopen"
              ? "Confirm the position is open again and set a new closing date. A reviewer checks the request before the listing goes live again."
              : "A reviewer checks these changes. The current version stays live until they are approved."}
          </AlertDescription>
        </Alert>
      ) : null}
      <ActionError error={actionData?.error} />
      <JobForm
        values={actionData?.values ?? loaderData.values}
        errors={actionData?.errors}
        showHiringCompany={loaderData.isAgency}
        actions={
          kind
            ? [{ name: "intent", value: "revise", label: "Submit for review" }]
            : [
                { name: "intent", value: "submit", label: "Save and submit for review" },
                { name: "intent", value: "save", label: "Save draft" },
              ]
        }
      />
    </>
  );
}
