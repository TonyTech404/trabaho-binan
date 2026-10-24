import { ArrowLeft } from "lucide-react";
import { data, Link, redirect } from "react-router";
import { ApplicationDetail } from "~/components/dashboard/applications";
import { NoticeBanner } from "~/components/dashboard/notice";
import { PageHeader } from "~/components/dashboard/shell";
import { ApplicationStatusBadge } from "~/components/dashboard/status";
import { getServices } from "~/lib/context.server";
import { APPLICATION_STATUSES } from "~/lib/labels";
import { serviceErrorResult, withNotice } from "~/lib/route-helpers.server";
import { requireEmployerViewer } from "~/lib/session.server";
import { getApplication, updateApplicationStatus } from "~/services/applications.server";
import { NotFoundError } from "~/services/common.server";
import type { ApplicationStatus } from "~/db/schema";
import type { Route } from "./+types/application";

export const meta = ({ loaderData }: Route.MetaArgs) => [
  { title: `${loaderData?.application.fullName ?? "Application"} — Employer dashboard` },
];

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const viewer = await requireEmployerViewer(request, context);
  const db = await getServices(context).db();
  try {
    return await getApplication(db, viewer, params.applicationId);
  } catch (error) {
    if (error instanceof NotFoundError) throw data("Application not found", { status: 404 });
    throw error;
  }
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const viewer = await requireEmployerViewer(request, context);
  const status = String((await request.formData()).get("status") ?? "");
  if (!Object.hasOwn(APPLICATION_STATUSES, status)) {
    return data({ error: "Choose a status." }, { status: 400 });
  }
  const db = await getServices(context).db();
  try {
    await updateApplicationStatus(db, viewer, params.applicationId, status as ApplicationStatus);
  } catch (error) {
    return serviceErrorResult(error);
  }
  return redirect(
    withNotice(`/employer/applications/${params.applicationId}`, "application_status"),
  );
}

export default function Application({ loaderData }: Route.ComponentProps) {
  const { application } = loaderData;
  return (
    <>
      <PageHeader
        back={
          <Link
            to="/employer/applications"
            className="link inline-flex min-h-11 items-center gap-1.5"
          >
            <ArrowLeft aria-hidden="true" className="size-4" />
            All applications
          </Link>
        }
        title={application.fullName}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <ApplicationStatusBadge status={application.status} />
            {loaderData.job.title}
          </span>
        }
      />
      <NoticeBanner />
      <ApplicationDetail data={loaderData} jobPath={`/employer/jobs/${loaderData.job.id}`} />
    </>
  );
}
