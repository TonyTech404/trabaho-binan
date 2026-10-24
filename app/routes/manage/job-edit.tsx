import { ArrowLeft } from "lucide-react";
import { data, Link, redirect } from "react-router";
import { ActionError } from "~/components/dashboard/job-panels";
import { PageHeader } from "~/components/dashboard/shell";
import { JobForm, jobToFormValues } from "~/components/job/job-form";
import { Alert, AlertDescription } from "~/components/ui/alert";
import { getServices } from "~/lib/context.server";
import {
  parseJobForm,
  purgeJobPages,
  serviceErrorResult,
  withNotice,
} from "~/lib/route-helpers.server";
import { requireStaffViewer } from "~/lib/session.server";
import { getJobForActor } from "~/services/job-queries.server";
import { updateJob } from "~/services/jobs.server";
import type { Route } from "./+types/job-edit";

export const meta = () => [{ title: "Edit listing — Review dashboard" }];

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const viewer = await requireStaffViewer(request, context);
  const db = await getServices(context).db();
  try {
    const { job, organization } = await getJobForActor(db, viewer, params.jobId);
    return {
      job: { id: job.id, title: job.title, status: job.status },
      values: jobToFormValues(job),
      isAgency: organization.type === "agency",
    };
  } catch (error) {
    throw serviceErrorResult(error);
  }
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const viewer = await requireStaffViewer(request, context);
  const parsed = parseJobForm(await request.formData());
  if (!parsed.ok)
    return data(
      { errors: parsed.errors, values: parsed.values, error: undefined },
      { status: 400 },
    );
  const db = await getServices(context).db();
  try {
    const job = await updateJob(db, viewer, params.jobId, parsed.input);
    await purgeJobPages(context, job);
    return redirect(withNotice(`/manage/jobs/${job.id}`, "saved"));
  } catch (error) {
    const result = serviceErrorResult(error);
    return data({ ...result.data, values: parsed.values }, { status: result.init?.status ?? 400 });
  }
}

export default function EditJob({ loaderData, actionData }: Route.ComponentProps) {
  const { job } = loaderData;
  const live = job.status === "published" || job.status === "paused";
  return (
    <>
      <PageHeader
        back={
          <Link
            to={`/manage/jobs/${job.id}`}
            className="link inline-flex min-h-11 items-center gap-1.5"
          >
            <ArrowLeft aria-hidden="true" className="size-4" />
            Back to listing
          </Link>
        }
        title="Edit listing"
        description={job.title}
      />
      {live ? (
        <Alert variant="warning" className="mb-5">
          <AlertDescription className="text-ink">
            This listing is live. Your changes are published as soon as you save, and the change is
            recorded in the history.
          </AlertDescription>
        </Alert>
      ) : null}
      <ActionError error={actionData?.error} />
      <JobForm
        values={actionData?.values ?? loaderData.values}
        errors={actionData?.errors}
        showHiringCompany={loaderData.isAgency || !!loaderData.values.hiringCompanyName}
        showSource
        actions={[
          {
            name: "intent",
            value: "save",
            label: live ? "Save and publish changes" : "Save changes",
          },
        ]}
      />
    </>
  );
}
