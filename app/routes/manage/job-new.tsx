import { ArrowLeft } from "lucide-react";
import { data, Link, redirect } from "react-router";
import { ActionError } from "~/components/dashboard/job-panels";
import { PageHeader } from "~/components/dashboard/shell";
import { JobForm } from "~/components/job/job-form";
import { getServices } from "~/lib/context.server";
import {
  parseJobForm,
  purgeJobPages,
  serviceErrorResult,
  withNotice,
} from "~/lib/route-helpers.server";
import { requireStaffViewer } from "~/lib/session.server";
import { approveJob, createJob } from "~/services/jobs.server";
import { listOrganizationOptions } from "~/services/organizations.server";
import type { Route } from "./+types/job-new";

export const meta = () => [{ title: "Add a vacancy — Trabaho Biñan" }];

export async function loader({ request, context }: Route.LoaderArgs) {
  await requireStaffViewer(request, context);
  const db = await getServices(context).db();
  const organizationId = new URL(request.url).searchParams.get("organization") ?? "";
  return { organizations: await listOrganizationOptions(db), organizationId };
}

export async function action({ request, context }: Route.ActionArgs) {
  const viewer = await requireStaffViewer(request, context);
  const form = await request.formData();
  const parsed = parseJobForm(form);
  const organizationId = String(form.get("organizationId") ?? "");
  if (!parsed.ok)
    return data(
      { errors: parsed.errors, values: { ...parsed.values, organizationId }, error: undefined },
      { status: 400 },
    );
  const db = await getServices(context).db();
  try {
    const job = await createJob(db, viewer, parsed.input, { organizationId });
    if (form.get("intent") === "publish") {
      const published = await approveJob(
        db,
        viewer,
        job.id,
        "Created and published by a reviewer.",
      );
      await purgeJobPages(context, published);
      return redirect(withNotice(`/manage/jobs/${job.id}`, "approved"));
    }
    return redirect(withNotice(`/manage/jobs/${job.id}`, "created"));
  } catch (error) {
    const result = serviceErrorResult(error);
    return data(
      { ...result.data, values: { ...parsed.values, organizationId } },
      { status: result.init?.status ?? 400 },
    );
  }
}

export default function NewJob({ loaderData, actionData }: Route.ComponentProps) {
  return (
    <>
      <PageHeader
        back={
          <Link to="/manage/jobs" className="link inline-flex min-h-11 items-center gap-1.5">
            <ArrowLeft aria-hidden="true" className="size-4" />
            All jobs
          </Link>
        }
        title="Add a vacancy"
        description="For vacancies received from an employer by email, phone, walk-in or Facebook message. Confirm the details with the employer before publishing."
      />
      <ActionError error={actionData?.error} />
      <JobForm
        organizations={loaderData.organizations}
        values={actionData?.values ?? { organizationId: loaderData.organizationId }}
        errors={actionData?.errors}
        showHiringCompany
        showSource
        actions={[
          { name: "intent", value: "publish", label: "Publish now" },
          { name: "intent", value: "draft", label: "Save as draft" },
        ]}
      />
    </>
  );
}
