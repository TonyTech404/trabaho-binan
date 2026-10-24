import { Flag } from "lucide-react";
import { data, Form, Link, redirect } from "react-router";
import { ActionError, ActionForm } from "~/components/dashboard/job-panels";
import { NoticeBanner } from "~/components/dashboard/notice";
import { PageHeader } from "~/components/dashboard/shell";
import { JobStatusBadge, ReportStatusBadge } from "~/components/dashboard/status";
import { EmptyState } from "~/components/empty-state";
import { Button } from "~/components/ui/button";
import { Label } from "~/components/ui/label";
import { NativeSelect, NativeSelectOption } from "~/components/ui/native-select";
import { getServices } from "~/lib/context.server";
import { label, REPORT_REASONS, REPORT_STATUSES } from "~/lib/labels";
import {
  purgeJobPages,
  reasonFrom,
  serviceErrorResult,
  withNotice,
} from "~/lib/route-helpers.server";
import { requireStaffViewer } from "~/lib/session.server";
import { formatDateTime } from "~/lib/time";
import { pauseJob } from "~/services/jobs.server";
import { listReports, resolveReport } from "~/services/reports.server";
import type { Route } from "./+types/reports";

export const meta = () => [{ title: "Reports — Review dashboard" }];

export async function loader({ request, context }: Route.LoaderArgs) {
  const viewer = await requireStaffViewer(request, context);
  const raw = new URL(request.url).searchParams.get("status") ?? "open";
  const status =
    raw === "all"
      ? ""
      : Object.hasOwn(REPORT_STATUSES, raw)
        ? (raw as "open" | "resolved" | "dismissed")
        : "open";
  const db = await getServices(context).db();
  return {
    status: raw === "all" ? "all" : status,
    reports: await listReports(db, viewer, { status }),
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  const viewer = await requireStaffViewer(request, context);
  const db = await getServices(context).db();
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  const note = reasonFrom(form);
  try {
    if (intent === "pause_job") {
      if (!note) return data({ error: "Write why the listing is paused." }, { status: 400 });
      const job = await pauseJob(db, viewer, String(form.get("jobId") ?? ""), note);
      await purgeJobPages(context, job);
      return redirect(withNotice("/manage/reports", "paused"));
    }
    if (intent === "resolve" || intent === "dismiss") {
      if (!note) return data({ error: "Record the action taken." }, { status: 400 });
      await resolveReport(
        db,
        viewer,
        String(form.get("reportId") ?? ""),
        intent === "resolve" ? "resolved" : "dismissed",
        note,
      );
      return redirect(withNotice("/manage/reports", "report_resolved"));
    }
    return data({ error: "Unknown action." }, { status: 400 });
  } catch (error) {
    return serviceErrorResult(error);
  }
}

export default function Reports({ loaderData, actionData }: Route.ComponentProps) {
  const { reports, status } = loaderData;
  return (
    <>
      <PageHeader
        title="Reports"
        description="Problems reported by visitors. Pause a listing straight away if it may be a scam, then investigate."
      />
      <NoticeBanner />
      <ActionError error={actionData?.error} />
      <Form method="get" className="mb-4 flex flex-wrap items-end gap-3">
        <div className="w-56 space-y-1.5">
          <Label htmlFor="report-status">Show</Label>
          <NativeSelect id="report-status" name="status" defaultValue={status}>
            {Object.entries(REPORT_STATUSES).map(([v, l]) => (
              <NativeSelectOption key={v} value={v}>
                {l}
              </NativeSelectOption>
            ))}
            <NativeSelectOption value="all">All reports</NativeSelectOption>
          </NativeSelect>
        </div>
        <Button type="submit" variant="outline">
          Apply
        </Button>
      </Form>
      {reports.length === 0 ? (
        <EmptyState icon={Flag} title={status === "open" ? "No open reports" : "No reports"}>
          <p>Reports from the public appear here.</p>
        </EmptyState>
      ) : (
        <ul className="space-y-3">
          {reports.map((r) => (
            <li key={r.id} className="rounded-lg border border-line bg-surface p-4">
              <div className="flex flex-wrap items-center gap-2">
                <ReportStatusBadge status={r.status} />
                <span className="font-semibold">{label(REPORT_REASONS, r.reason)}</span>
                <span className="text-sm text-ink-muted">{formatDateTime(r.createdAt)}</span>
              </div>
              <p className="mt-2 flex flex-wrap items-center gap-2">
                <Link to={`/manage/jobs/${r.jobId}`} className="link [overflow-wrap:anywhere]">
                  {r.jobTitle}
                </Link>
                <span className="text-ink-muted">{r.organizationName}</span>
                <JobStatusBadge status={r.jobStatus} />
              </p>
              {r.details ? (
                <p className="mt-2 rounded-md bg-muted px-3 py-2 whitespace-pre-line">
                  {r.details}
                </p>
              ) : null}
              {r.reporterContact ? (
                <p className="mt-2 text-sm">
                  Reporter contact (erased when closed): {r.reporterContact}
                </p>
              ) : null}
              {r.status === "open" ? (
                <div className="mt-3 flex flex-wrap items-start gap-2">
                  {r.jobStatus === "published" ? (
                    <ActionForm
                      intent="pause_job"
                      label="Pause listing"
                      variant="destructive-outline"
                      hidden={{ jobId: r.jobId }}
                      reasonLabel="Why pause it?"
                      reasonHint="The employer sees this note."
                      confirmLabel="Pause listing"
                    />
                  ) : null}
                  <ActionForm
                    intent="resolve"
                    label="Close report"
                    hidden={{ reportId: r.id }}
                    reasonLabel="Action taken"
                    reasonHint="For example: called employer, listing corrected."
                    confirmLabel="Close report"
                  />
                  <ActionForm
                    intent="dismiss"
                    label="Dismiss"
                    hidden={{ reportId: r.id }}
                    reasonLabel="Why dismiss?"
                    confirmLabel="Dismiss report"
                  />
                </div>
              ) : (
                <p className="mt-2 text-sm text-ink-muted">
                  {r.resolvedByName ? `${r.resolvedByName}, ` : ""}
                  {formatDateTime(r.resolvedAt)}: {r.resolutionNote}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
