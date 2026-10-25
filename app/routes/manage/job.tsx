import { ArrowLeft, Flag, Pencil } from "lucide-react";
import { data, Link, redirect } from "react-router";
import {
  ActionError,
  ActionForm,
  JobFactsCard,
  JobTimeline,
  PolicyFlagsAlert,
  RevisionDiff,
  revisionKindLabel,
} from "~/components/dashboard/job-panels";
import { NoticeBanner } from "~/components/dashboard/notice";
import { PageHeader } from "~/components/dashboard/shell";
import {
  JobStatusBadge,
  ReportStatusBadge,
  RevisionStatusBadge,
  VerificationBadge,
} from "~/components/dashboard/status";
import { JobText } from "~/components/job/job-text";
import { buttonVariants } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { NativeSelect, NativeSelectOption } from "~/components/ui/native-select";
import { getServices } from "~/lib/context.server";
import { CLOSE_REASONS, REPORT_REASONS, label } from "~/lib/labels";
import { findPolicyFlags } from "~/lib/policy-flags";
import {
  purgeJobPages,
  reasonFrom,
  serviceErrorResult,
  withNotice,
} from "~/lib/route-helpers.server";
import { requireStaffViewer } from "~/lib/session.server";
import {
  addDaysToDateString,
  describeAge,
  endOfManilaDay,
  formatDateTime,
  manilaDateString,
} from "~/lib/time";
import { DEFAULT_LISTING_DAYS, MAX_LISTING_DAYS } from "~/lib/validation";
import { getJobForActor } from "~/services/job-queries.server";
import {
  approveJob,
  archiveJob,
  closeJob,
  confirmJob,
  pauseJob,
  rejectJob,
  renewJob,
  requestJobChanges,
  resumeJob,
  reviewRevision,
} from "~/services/jobs.server";
import { listReportsForJob } from "~/services/reports.server";
import { countApplicationsForJob } from "~/services/applications.server";
import type { Route } from "./+types/job";

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: `${loaderData?.job.title ?? "Job"} — Review dashboard` }];
}

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const viewer = await requireStaffViewer(request, context);
  const db = await getServices(context).db();
  try {
    const [detail, reports, applicationCount] = await Promise.all([
      getJobForActor(db, viewer, params.jobId),
      listReportsForJob(db, viewer, params.jobId),
      countApplicationsForJob(db, viewer, params.jobId),
    ]);
    const flags = findPolicyFlags(
      detail.job.title,
      detail.job.description,
      detail.job.qualifications,
    );
    const revisionFlags = detail.openRevision
      ? findPolicyFlags(
          detail.openRevision.title,
          detail.openRevision.description,
          detail.openRevision.qualifications,
        )
      : [];
    const deadlinePassed = detail.job.deadlineAt.getTime() <= Date.now();
    return { ...detail, reports, flags, revisionFlags, deadlinePassed, applicationCount };
  } catch (error) {
    throw serviceErrorResult(error);
  }
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const viewer = await requireStaffViewer(request, context);
  const db = await getServices(context).db();
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  const reason = reasonFrom(form);
  const jobId = params.jobId;
  const needReason = () =>
    data({ error: "Write a short reason first.", errors: {} }, { status: 400 });

  try {
    let job;
    let notice = intent;
    switch (intent) {
      case "approve":
        job = await approveJob(db, viewer, jobId, reason, new Date(), {
          expectedUpdatedAt: String(form.get("version") ?? ""),
        });
        notice = "approved";
        break;
      case "request_changes":
        if (!reason) return needReason();
        job = await requestJobChanges(db, viewer, jobId, reason);
        notice = "changes_requested";
        break;
      case "reject":
        if (!reason) return needReason();
        job = await rejectJob(db, viewer, jobId, reason);
        notice = "rejected";
        break;
      case "pause":
        if (!reason) return needReason();
        job = await pauseJob(db, viewer, jobId, reason);
        notice = "paused";
        break;
      case "resume":
        job = await resumeJob(db, viewer, jobId);
        notice = "resumed";
        break;
      case "close": {
        const closeReason = String(form.get("closeReason") ?? "");
        if (!Object.hasOwn(CLOSE_REASONS, closeReason))
          return data({ error: "Choose why the listing is closing.", errors: {} }, { status: 400 });
        job = await closeJob(db, viewer, jobId, closeReason);
        notice = "closed";
        break;
      }
      case "archive":
        job = await archiveJob(db, viewer, jobId);
        notice = "archived";
        break;
      case "confirm":
        job = await confirmJob(db, viewer, jobId);
        notice = "confirmed";
        break;
      case "renew": {
        const date = String(form.get("deadline") ?? "");
        const today = manilaDateString();
        if (
          !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
          date < today ||
          date > addDaysToDateString(today, MAX_LISTING_DAYS)
        ) {
          return data(
            {
              error: `Choose a closing date from today up to ${MAX_LISTING_DAYS} days ahead.`,
              errors: {},
            },
            { status: 400 },
          );
        }
        job = await renewJob(db, viewer, jobId, endOfManilaDay(date));
        notice = "renewed";
        break;
      }
      case "revision_approve":
      case "revision_request_changes":
      case "revision_reject": {
        const decision =
          intent === "revision_approve"
            ? "approve"
            : intent === "revision_reject"
              ? "reject"
              : "request_changes";
        if (decision !== "approve" && !reason) return needReason();
        const result = await reviewRevision(
          db,
          viewer,
          String(form.get("revisionId") ?? ""),
          decision,
          reason,
          new Date(),
          String(form.get("submittedAt") ?? ""),
        );
        job = result.job;
        notice =
          decision === "approve"
            ? "revision_approved"
            : decision === "reject"
              ? "revision_rejected"
              : "revision_changes_requested";
        break;
      }
      default:
        return data({ error: "Unknown action.", errors: {} }, { status: 400 });
    }
    await purgeJobPages(context, job);
    return redirect(withNotice(`/manage/jobs/${jobId}`, notice));
  } catch (error) {
    return serviceErrorResult(error);
  }
}

export default function ManageJob({ loaderData, actionData }: Route.ComponentProps) {
  const {
    job,
    organization,
    openRevision,
    events,
    reports,
    flags,
    revisionFlags,
    metrics,
    lastConfirmedByName,
    createdByStaff,
  } = loaderData;
  const s = job.status;
  const today = manilaDateString();
  const editable = ["draft", "pending_review", "changes_requested", "published", "paused"].includes(
    s,
  );
  const openReports = reports.filter((r) => r.status === "open");

  return (
    <>
      <PageHeader
        back={
          <Link to="/manage/jobs" className="link inline-flex min-h-11 items-center gap-1.5">
            <ArrowLeft aria-hidden="true" className="size-4" />
            All jobs
          </Link>
        }
        title={job.title}
        description={
          <p className="flex flex-wrap items-center gap-2">
            <JobStatusBadge status={s} deadlinePassed={loaderData.deadlinePassed} />
            <Link to={`/manage/employers/${organization.id}`} className="link">
              {organization.name}
            </Link>
            <VerificationBadge status={organization.verificationStatus} />
            <span className="text-sm">ID {job.publicId}</span>
          </p>
        }
        actions={
          editable ? (
            <Link
              to={`/manage/jobs/${job.id}/edit`}
              className={buttonVariants({ variant: "outline" })}
            >
              <Pencil aria-hidden="true" />
              Edit
            </Link>
          ) : null
        }
      />
      <NoticeBanner />
      <ActionError error={actionData?.error} />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-6">
          {openReports.length ? (
            <section
              aria-labelledby="reports-heading"
              className="rounded-lg border-2 border-danger/50 bg-danger-tint/40 p-4"
            >
              <h2 id="reports-heading" className="flex items-center gap-2 text-xl font-bold">
                <Flag aria-hidden="true" className="size-5 text-danger" />
                {openReports.length} open {openReports.length === 1 ? "report" : "reports"}
              </h2>
              <ul className="mt-2 space-y-2">
                {openReports.map((r) => (
                  <li key={r.id}>
                    <span className="font-semibold">{label(REPORT_REASONS, r.reason)}</span>
                    <span className="text-sm text-ink-muted">, {describeAge(r.createdAt)}</span>
                    {r.details ? (
                      <p className="text-[0.9375rem] whitespace-pre-line">{r.details}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
              <Link
                to="/manage/reports?status=open"
                className="link mt-2 inline-flex min-h-11 items-center"
              >
                Handle reports
              </Link>
            </section>
          ) : null}

          {s === "pending_review" || s === "draft" || s === "changes_requested" ? (
            <PolicyFlagsAlert flags={flags} audience="staff" />
          ) : null}

          <section
            aria-labelledby="decision-heading"
            className="rounded-lg border border-line bg-surface p-4"
          >
            <h2 id="decision-heading" className="text-xl font-bold">
              Actions
            </h2>
            <p className="mt-1 text-sm text-ink-muted">
              {s === "pending_review"
                ? "Check the employer, job details, closing date and application method, then decide."
                : s === "published"
                  ? "Live and accepting applications."
                  : s === "paused"
                    ? "Hidden from search; the public page says it is temporarily unavailable."
                    : null}
            </p>
            <div className="mt-3 flex flex-wrap items-start gap-2">
              {["pending_review", "changes_requested"].includes(s) ||
              (s === "draft" && createdByStaff) ? (
                <ActionForm
                  intent="approve"
                  label="Approve and publish"
                  variant="default"
                  hidden={{ version: new Date(job.updatedAt).toISOString() }}
                />
              ) : null}
              {s === "pending_review" ? (
                <ActionForm
                  intent="request_changes"
                  label="Request changes"
                  reasonLabel="What needs to change?"
                  reasonHint="The employer sees this note."
                  confirmLabel="Send back to employer"
                />
              ) : null}
              {["draft", "pending_review", "changes_requested"].includes(s) ? (
                <ActionForm
                  intent="reject"
                  label="Reject"
                  variant="destructive-outline"
                  reasonLabel="Why is it rejected?"
                  reasonHint="The employer sees this note."
                  confirmLabel="Reject listing"
                />
              ) : null}
              {s === "published" ? (
                <ActionForm intent="confirm" label="Mark confirmed open today" />
              ) : null}
              {s === "published" ? (
                <ActionForm
                  intent="pause"
                  label="Pause"
                  variant="destructive-outline"
                  reasonLabel="Why pause it?"
                  reasonHint="For example: investigating a report. The employer sees this note."
                  confirmLabel="Pause listing"
                />
              ) : null}
              {s === "paused" ? (
                <ActionForm intent="resume" label="Publish again" variant="default" />
              ) : null}
              {["published", "paused", "closed", "expired"].includes(s) ? (
                <ActionForm
                  intent="renew"
                  label={s === "closed" || s === "expired" ? "Reopen" : "Renew"}
                  confirmLabel={
                    s === "closed" || s === "expired"
                      ? "Reopen with this date"
                      : "Save new closing date"
                  }
                >
                  <p className="text-sm text-ink-muted">
                    Only after the employer confirms the opening is still available.
                  </p>
                  <div className="space-y-1.5">
                    <Label htmlFor="renew-deadline">New closing date</Label>
                    <Input
                      id="renew-deadline"
                      name="deadline"
                      type="date"
                      required
                      min={today}
                      max={addDaysToDateString(today, MAX_LISTING_DAYS)}
                      defaultValue={addDaysToDateString(today, DEFAULT_LISTING_DAYS)}
                    />
                  </div>
                </ActionForm>
              ) : null}
              {["published", "paused"].includes(s) ? (
                <ActionForm
                  intent="close"
                  label="Close"
                  variant="destructive-outline"
                  confirmLabel="Close listing"
                >
                  <div className="space-y-1.5">
                    <Label htmlFor="close-reason">Why is it closing?</Label>
                    <NativeSelect
                      id="close-reason"
                      name="closeReason"
                      required
                      defaultValue="filled"
                    >
                      {Object.entries(CLOSE_REASONS).map(([v, l]) => (
                        <NativeSelectOption key={v} value={v}>
                          {l}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                  </div>
                </ActionForm>
              ) : null}
              {["draft", "rejected", "closed", "expired"].includes(s) ? (
                <ActionForm intent="archive" label="Archive" />
              ) : null}
            </div>
          </section>

          {openRevision ? (
            <section
              id="revision"
              aria-labelledby="revision-heading"
              className="scroll-mt-6 rounded-lg border-2 border-pine/40 bg-surface p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 id="revision-heading" className="text-xl font-bold">
                  Proposed {revisionKindLabel(openRevision.kind).toLowerCase()} from the employer
                </h2>
                <RevisionStatusBadge status={openRevision.status} />
              </div>
              <p className="mt-1 text-sm text-ink-muted">
                Submitted {formatDateTime(openRevision.submittedAt)}. The live listing stays as it
                is until you approve.
              </p>
              <div className="mt-4 space-y-4">
                <PolicyFlagsAlert flags={revisionFlags} audience="staff" />
                <RevisionDiff live={job} proposed={openRevision} />
              </div>
              {openRevision.status === "pending_review" ? (
                <div className="mt-4 flex flex-wrap items-start gap-2">
                  <ActionForm
                    intent="revision_approve"
                    label="Approve changes"
                    variant="default"
                    hidden={{
                      revisionId: openRevision.id,
                      submittedAt: openRevision.submittedAt
                        ? new Date(openRevision.submittedAt).toISOString()
                        : "",
                    }}
                  />
                  <ActionForm
                    intent="revision_request_changes"
                    label="Request changes"
                    hidden={{ revisionId: openRevision.id }}
                    reasonLabel="What needs to change?"
                    confirmLabel="Send back"
                  />
                  <ActionForm
                    intent="revision_reject"
                    label="Reject changes"
                    variant="destructive-outline"
                    hidden={{ revisionId: openRevision.id }}
                    reasonLabel="Why are the changes rejected?"
                    confirmLabel="Reject changes"
                  />
                </div>
              ) : (
                <p className="mt-3 text-ink-muted">
                  Waiting for the employer to update the revision.
                </p>
              )}
            </section>
          ) : null}

          <section
            aria-labelledby="content-heading"
            className="space-y-4 rounded-lg border border-line bg-surface p-4"
          >
            <h2 id="content-heading" className="text-xl font-bold">
              Listing content
            </h2>
            <div>
              <h3 className="font-semibold">Description</h3>
              <JobText text={job.description} />
            </div>
            {job.qualifications ? (
              <div>
                <h3 className="font-semibold">Other qualifications</h3>
                <JobText text={job.qualifications} />
              </div>
            ) : null}
            <div>
              <h3 className="font-semibold">How to apply</h3>
              <ul className="prose-job">
                {job.applicationUrl ? (
                  <li className="[overflow-wrap:anywhere]">Link: {job.applicationUrl}</li>
                ) : null}
                {job.applicationEmail ? <li>Email: {job.applicationEmail}</li> : null}
                {job.walkInInstructions ? (
                  <li className="whitespace-pre-line">Walk-in: {job.walkInInstructions}</li>
                ) : null}
                {job.applicationNotes ? (
                  <li className="whitespace-pre-line">Prepare: {job.applicationNotes}</li>
                ) : null}
              </ul>
            </div>
            <div className="rounded-md bg-muted p-3 text-[0.9375rem]">
              <h3 className="font-semibold">Internal contact (not public)</h3>
              <p>
                {[job.contactName, job.contactEmail, job.contactPhone].filter(Boolean).join(", ") ||
                  "None given"}
                {job.sourceReference ? (
                  <span className="block text-ink-muted">Source: {job.sourceReference}</span>
                ) : null}
              </p>
            </div>
          </section>

          {reports.length > openReports.length ? (
            <section
              aria-labelledby="past-reports"
              className="rounded-lg border border-line bg-surface p-4"
            >
              <h2 id="past-reports" className="text-xl font-bold">
                Past reports
              </h2>
              <ul className="mt-2 space-y-2">
                {reports
                  .filter((r) => r.status !== "open")
                  .map((r) => (
                    <li key={r.id} className="flex flex-wrap items-center gap-2">
                      <ReportStatusBadge status={r.status} />
                      {label(REPORT_REASONS, r.reason)}
                      {r.resolutionNote ? (
                        <span className="text-ink-muted">: {r.resolutionNote}</span>
                      ) : null}
                    </li>
                  ))}
              </ul>
            </section>
          ) : null}
        </div>

        <div className="space-y-6">
          <JobFactsCard
            job={job}
            lastConfirmedByName={lastConfirmedByName}
            metrics={metrics}
            applications={{
              count: loaderData.applicationCount,
              href: `/manage/applications?job=${job.id}`,
            }}
          />
          <JobTimeline events={events} />
        </div>
      </div>
    </>
  );
}
