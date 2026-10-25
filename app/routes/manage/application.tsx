import { ArrowLeft } from "lucide-react";
import { data, Link, redirect } from "react-router";
import { ApplicationDetail } from "~/components/dashboard/applications";
import { NoticeBanner } from "~/components/dashboard/notice";
import { PageHeader } from "~/components/dashboard/shell";
import { ApplicationStatusBadge } from "~/components/dashboard/status";
import { getServices } from "~/lib/context.server";
import { APPLICATION_STATUSES } from "~/lib/labels";
import { purgeJobPages, serviceErrorResult, withNotice } from "~/lib/route-helpers.server";
import { requireStaffViewer } from "~/lib/session.server";
import {
  closeFilledJob,
  getApplication,
  updateApplicationStatus,
} from "~/services/applications.server";
import { NotFoundError } from "~/services/common.server";
import type { ApplicationStatus } from "~/db/schema";
import type { Route } from "./+types/application";

export const meta = ({ loaderData }: Route.MetaArgs) => [
  { title: `${loaderData?.application.fullName ?? "Application"} — Review dashboard` },
];

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const viewer = await requireStaffViewer(request, context);
  const db = await getServices(context).db();
  try {
    return await getApplication(db, viewer, params.applicationId);
  } catch (error) {
    if (error instanceof NotFoundError) throw data("Application not found", { status: 404 });
    throw error;
  }
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const viewer = await requireStaffViewer(request, context);
  const form = await request.formData();
  const db = await getServices(context).db();
  try {
    if (form.get("intent") === "close_job") {
      const { closedJob } = await closeFilledJob(db, viewer, params.applicationId, {
        notifyOthers: form.get("notifyOthers") === "on",
      });
      if (closedJob) await purgeJobPages(context, closedJob);
      return redirect(withNotice(`/manage/applications/${params.applicationId}`, "filled"));
    }
    const status = String(form.get("status") ?? "");
    if (!Object.hasOwn(APPLICATION_STATUSES, status)) {
      return data({ error: "Choose a status." }, { status: 400 });
    }
    await updateApplicationStatus(db, viewer, params.applicationId, status as ApplicationStatus);
  } catch (error) {
    return serviceErrorResult(error);
  }
  return redirect(withNotice(`/manage/applications/${params.applicationId}`, "application_status"));
}

export default function Application({ loaderData }: Route.ComponentProps) {
  const { application } = loaderData;
  return (
    <>
      <PageHeader
        back={
          <Link
            to="/manage/applications"
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
      <ApplicationDetail data={loaderData} jobPath={`/manage/jobs/${loaderData.job.id}`} />
    </>
  );
}
