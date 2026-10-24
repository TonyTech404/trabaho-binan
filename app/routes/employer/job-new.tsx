import { ArrowLeft } from "lucide-react";
import { data, Link, redirect } from "react-router";
import { ActionError } from "~/components/dashboard/job-panels";
import { PageHeader } from "~/components/dashboard/shell";
import { JobForm } from "~/components/job/job-form";
import { getServices } from "~/lib/context.server";
import { parseJobForm, serviceErrorResult, withNotice } from "~/lib/route-helpers.server";
import { requireEmployerViewer } from "~/lib/session.server";
import { getOrganizationForActor } from "~/services/organizations.server";
import { createJob, submitJob } from "~/services/jobs.server";
import type { Route } from "./+types/job-new";

export const meta = () => [{ title: "Post a job — Employer dashboard" }];

export async function loader({ request, context }: Route.LoaderArgs) {
  const viewer = await requireEmployerViewer(request, context);
  const org = await getOrganizationForActor(
    await getServices(context).db(),
    viewer,
    viewer.organizationId!,
  );
  return { isAgency: org.type === "agency", contactName: viewer.name, contactEmail: viewer.email };
}

export async function action({ request, context }: Route.ActionArgs) {
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
    // The organization always comes from the session, never from the form.
    const job = await createJob(db, viewer, parsed.input);
    if (form.get("intent") === "submit") {
      await submitJob(db, viewer, job.id);
      return redirect(withNotice(`/employer/jobs/${job.id}`, "submitted"));
    }
    return redirect(withNotice(`/employer/jobs/${job.id}`, "created"));
  } catch (error) {
    const result = serviceErrorResult(error);
    return data({ ...result.data, values: parsed.values }, { status: result.init?.status ?? 400 });
  }
}

export default function EmployerNewJob({ loaderData, actionData }: Route.ComponentProps) {
  return (
    <>
      <PageHeader
        back={
          <Link to="/employer" className="link inline-flex min-h-11 items-center gap-1.5">
            <ArrowLeft aria-hidden="true" className="size-4" />
            Your jobs
          </Link>
        }
        title="Post a job"
        description="A reviewer checks every listing before it is published. Be specific: clear listings are approved faster."
      />
      <ActionError error={actionData?.error} />
      <JobForm
        values={
          actionData?.values ?? {
            contactName: loaderData.contactName,
            contactEmail: loaderData.contactEmail,
          }
        }
        errors={actionData?.errors}
        showHiringCompany={loaderData.isAgency}
        actions={[
          { name: "intent", value: "submit", label: "Submit for review" },
          { name: "intent", value: "draft", label: "Save as draft" },
        ]}
      />
    </>
  );
}
