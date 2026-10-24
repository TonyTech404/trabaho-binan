import { ArrowLeft, MessageSquareWarning, Pencil, RefreshCcw } from "lucide-react";
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
import { JobStatusBadge, RevisionStatusBadge } from "~/components/dashboard/status";
import { JobText } from "~/components/job/job-text";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { buttonVariants } from "~/components/ui/button";
import { Label } from "~/components/ui/label";
import { NativeSelect, NativeSelectOption } from "~/components/ui/native-select";
import { getServices } from "~/lib/context.server";
import { CLOSE_REASONS, JOB_EVENT_LABELS } from "~/lib/labels";
import { findPolicyFlags } from "~/lib/policy-flags";
import { purgeJobPages, serviceErrorResult, withNotice } from "~/lib/route-helpers.server";
import { requireEmployerViewer } from "~/lib/session.server";
import { formatDateTime } from "~/lib/time";
import { getJobForActor } from "~/services/job-queries.server";
import {
  closeJob,
  confirmJob,
  submitJob,
  withdrawRevision,
  withdrawSubmission,
} from "~/services/jobs.server";
import type { Route } from "./+types/job";

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: `${loaderData?.job.title ?? "Job"} — Employer dashboard` }];
}

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const viewer = await requireEmployerViewer(request, context);
  const db = await getServices(context).db();
  try {
    // Returns 404 for other organizations' jobs, including by direct URL.
    const detail = await getJobForActor(db, viewer, params.jobId);
    const feedback = detail.events.find(
      (e) =>
        [
          "changes_requested",
          "rejected",
          "paused",
          "revision_changes_requested",
          "revision_rejected",
        ].includes(e.type) && e.note,
    );
    return {
      job: detail.job,
      openRevision: detail.openRevision,
      events: detail.events,
      metrics: detail.metrics,
      feedback: feedback ?? null,
      flags: findPolicyFlags(detail.job.title, detail.job.description, detail.job.qualifications),
      deadlinePassed: detail.job.deadlineAt.getTime() <= Date.now(),
    };
  } catch (error) {
    throw serviceErrorResult(error);
  }
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const viewer = await requireEmployerViewer(request, context);
  const db = await getServices(context).db();
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  const jobId = params.jobId;
  try {
    let notice = intent;
    switch (intent) {
      case "submit":
        await submitJob(db, viewer, jobId);
        notice = "submitted";
        break;
      case "withdraw":
        await withdrawSubmission(db, viewer, jobId);
        notice = "withdrawn";
        break;
      case "confirm":
        await confirmJob(db, viewer, jobId);
        notice = "confirmed";
        break;
      case "close": {
        const reason = String(form.get("closeReason") ?? "");
        if (!Object.hasOwn(CLOSE_REASONS, reason))
          return data({ error: "Choose why the job is closing." }, { status: 400 });
        const job = await closeJob(db, viewer, jobId, reason);
        await purgeJobPages(context, job);
        notice = "closed";
        break;
      }
      case "withdraw_revision":
        await withdrawRevision(db, viewer, String(form.get("revisionId") ?? ""));
        notice = "revision_withdrawn";
        break;
      default:
        return data({ error: "Unknown action." }, { status: 400 });
    }
    return redirect(withNotice(`/employer/jobs/${jobId}`, notice));
  } catch (error) {
    return serviceErrorResult(error);
  }
}

const STATUS_HELP: Record<string, string> = {
  draft: "Only you and the review team can see this draft. Submit it when it is ready.",
  pending_review:
    "A reviewer will check the listing before it is published. You can withdraw it to make changes.",
  changes_requested: "A reviewer asked for changes. Edit the listing, then submit it again.",
  rejected: "This listing was not approved. You can post a new one.",
  published: "Live and accepting applications. Close it as soon as the position is filled.",
  paused: "Hidden while the review team checks something. Applicants cannot apply for now.",
  closed: "No longer accepting applications. Ask to reopen it if you are hiring again.",
  expired: "The closing date passed. Ask to reopen it if the position is still open.",
  archived: "Archived by the review team.",
};

export default function EmployerJob({ loaderData, actionData }: Route.ComponentProps) {
  const { job, openRevision, events, feedback, flags, metrics, deadlinePassed } = loaderData;
  const s = job.status;
  const live = s === "published" || s === "paused";
  return (
    <>
      <PageHeader
        back={
          <Link to="/employer" className="link inline-flex min-h-11 items-center gap-1.5">
            <ArrowLeft aria-hidden="true" className="size-4" />
            Your jobs
          </Link>
        }
        title={job.title}
        description={
          <div className="space-y-1">
            <JobStatusBadge status={s} deadlinePassed={deadlinePassed} />
            <p>{STATUS_HELP[s]}</p>
          </div>
        }
      />
      <NoticeBanner />
      <ActionError error={actionData?.error} />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-6">
          {feedback && ["changes_requested", "rejected", "paused"].includes(s) ? (
            <Alert variant={s === "rejected" ? "danger" : "warning"}>
              <MessageSquareWarning aria-hidden="true" />
              <AlertTitle>{JOB_EVENT_LABELS[feedback.type]}: review team's note</AlertTitle>
              <AlertDescription className="whitespace-pre-line text-ink">
                {feedback.note}
              </AlertDescription>
            </Alert>
          ) : null}
          {s === "draft" || s === "changes_requested" ? (
            <PolicyFlagsAlert flags={flags} audience="employer" />
          ) : null}

          <section
            aria-labelledby="actions-heading"
            className="rounded-lg border border-line bg-surface p-4"
          >
            <h2 id="actions-heading" className="text-xl font-bold">
              What you can do
            </h2>
            <div className="mt-3 flex flex-wrap items-start gap-2">
              {s === "draft" || s === "changes_requested" ? (
                <>
                  <ActionForm intent="submit" label="Submit for review" variant="default" />
                  <Link
                    to={`/employer/jobs/${job.id}/edit`}
                    className={buttonVariants({ variant: "outline" })}
                  >
                    <Pencil aria-hidden="true" />
                    Edit
                  </Link>
                </>
              ) : null}
              {s === "pending_review" ? (
                <ActionForm intent="withdraw" label="Withdraw to make changes" />
              ) : null}
              {live && !openRevision ? (
                <>
                  <Link
                    to={`/employer/jobs/${job.id}/edit?kind=edit`}
                    className={buttonVariants({ variant: "outline" })}
                  >
                    <Pencil aria-hidden="true" />
                    Change details
                  </Link>
                  <Link
                    to={`/employer/jobs/${job.id}/edit?kind=renewal`}
                    className={buttonVariants({ variant: "outline" })}
                  >
                    <RefreshCcw aria-hidden="true" />
                    Extend closing date
                  </Link>
                </>
              ) : null}
              {s === "published" ? (
                <ActionForm intent="confirm" label="Confirm still hiring" />
              ) : null}
              {live ? (
                <ActionForm
                  intent="close"
                  label="Close this job"
                  variant="destructive-outline"
                  confirmLabel="Close job now"
                >
                  <div className="space-y-1.5">
                    <Label htmlFor="close-reason">Why is it closing?</Label>
                    <NativeSelect id="close-reason" name="closeReason" defaultValue="filled">
                      {Object.entries(CLOSE_REASONS).map(([v, l]) => (
                        <NativeSelectOption key={v} value={v}>
                          {l}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                  </div>
                  <p className="text-sm text-ink-muted">
                    The listing stops accepting applications immediately.
                  </p>
                </ActionForm>
              ) : null}
              {(s === "closed" || s === "expired") && !openRevision ? (
                <Link
                  to={`/employer/jobs/${job.id}/edit?kind=reopen`}
                  className={buttonVariants({ variant: "outline" })}
                >
                  <RefreshCcw aria-hidden="true" />
                  Ask to reopen
                </Link>
              ) : null}
            </div>
            {live ? (
              <p className="mt-3 text-sm text-ink-muted">
                Changes to a live listing are checked by a reviewer. The current version stays live
                until they approve.
              </p>
            ) : null}
          </section>

          {openRevision ? (
            <section
              aria-labelledby="rev-heading"
              className="rounded-lg border-2 border-pine/40 bg-surface p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 id="rev-heading" className="text-xl font-bold">
                  Your {revisionKindLabel(openRevision.kind).toLowerCase()} request
                </h2>
                <RevisionStatusBadge status={openRevision.status} />
              </div>
              <p className="mt-1 text-sm text-ink-muted">
                Submitted {formatDateTime(openRevision.submittedAt)}.
              </p>
              {openRevision.status === "changes_requested" && openRevision.reviewNote ? (
                <Alert variant="warning" className="mt-3">
                  <MessageSquareWarning aria-hidden="true" />
                  <AlertTitle>Review team's note</AlertTitle>
                  <AlertDescription className="whitespace-pre-line text-ink">
                    {openRevision.reviewNote}
                  </AlertDescription>
                </Alert>
              ) : null}
              <div className="mt-4">
                <RevisionDiff live={job} proposed={openRevision} />
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link
                  to={`/employer/jobs/${job.id}/edit?kind=${openRevision.kind}`}
                  className={buttonVariants({ variant: "outline" })}
                >
                  <Pencil aria-hidden="true" />
                  Edit request
                </Link>
                <ActionForm
                  intent="withdraw_revision"
                  label="Withdraw request"
                  hidden={{ revisionId: openRevision.id }}
                />
              </div>
            </section>
          ) : null}

          <section
            aria-labelledby="content-heading"
            className="space-y-3 rounded-lg border border-line bg-surface p-4"
          >
            <h2 id="content-heading" className="text-xl font-bold">
              {live ? "Live version" : "Listing"}
            </h2>
            <JobText text={job.description} />
            {job.qualifications ? <JobText text={job.qualifications} /> : null}
          </section>
        </div>
        <div className="space-y-6">
          <JobFactsCard job={job} metrics={metrics} />
          <JobTimeline events={events} />
        </div>
      </div>
    </>
  );
}
