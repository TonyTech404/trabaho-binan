import { ApplicationFilters, ApplicationList } from "~/components/dashboard/applications";
import { NoticeBanner } from "~/components/dashboard/notice";
import { PageHeader } from "~/components/dashboard/shell";
import { getServices } from "~/lib/context.server";
import { APPLICATION_STATUSES } from "~/lib/labels";
import { requireStaffViewer } from "~/lib/session.server";
import { listApplications } from "~/services/applications.server";
import type { ApplicationStatus } from "~/db/schema";
import type { Route } from "./+types/applications";

export const meta = () => [{ title: "Applications — Review dashboard" }];

export async function loader({ request, context }: Route.LoaderArgs) {
  const viewer = await requireStaffViewer(request, context);
  const params = new URL(request.url).searchParams;
  const rawStatus = params.get("status") ?? "";
  const status = Object.hasOwn(APPLICATION_STATUSES, rawStatus)
    ? (rawStatus as ApplicationStatus)
    : "";
  const jobId = /^[0-9a-f-]{36}$/i.test(params.get("job") ?? "") ? String(params.get("job")) : "";
  const db = await getServices(context).db();
  const rows = await listApplications(db, viewer, { status, jobId });
  return { rows, status, jobId, jobTitle: jobId ? (rows[0]?.jobTitle ?? null) : null };
}

export default function Applications({ loaderData }: Route.ComponentProps) {
  const { rows, status, jobId, jobTitle } = loaderData;
  return (
    <>
      <PageHeader
        title="Applications"
        description="Applications sent on Trabaho Biñan. They are deleted automatically six months after they are sent."
      />
      <NoticeBanner />
      <ApplicationFilters
        status={status}
        jobId={jobId}
        jobTitle={jobTitle}
        basePath="/manage/applications"
      />
      <ApplicationList rows={rows} basePath="/manage/applications" showOrganization={true} />
    </>
  );
}
