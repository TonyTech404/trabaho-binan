import {
  CalendarClock,
  ChevronRight,
  ClipboardCheck,
  Flag,
  Plus,
  ShieldQuestion,
  Timer,
  UserCheck,
} from "lucide-react";
import { Link, useSearchParams } from "react-router";
import { PageHeader } from "~/components/dashboard/shell";
import { NoticeBanner } from "~/components/dashboard/notice";
import { buttonVariants } from "~/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { getServices } from "~/lib/context.server";
import { requireStaffViewer } from "~/lib/session.server";
import { daysUntil, describeAge, formatDate } from "~/lib/time";
import { RECONFIRM_AFTER_DAYS } from "~/lib/constants";
import { getStaffOverview } from "~/services/job-queries.server";
import { countHires } from "~/services/applications.server";
import type { Route } from "./+types/index";

export const meta = () => [{ title: "Overview — Trabaho Biñan" }];

export async function loader({ request, context }: Route.LoaderArgs) {
  const viewer = await requireStaffViewer(request, context);
  const db = await getServices(context).db();
  const [overview, hires] = await Promise.all([
    getStaffOverview(db, viewer),
    countHires(db, viewer),
  ]);
  return { name: viewer.name, ...overview, hires };
}

function TaskRow({
  to,
  icon: Icon,
  count,
  label,
  empty,
}: {
  to: string;
  icon: typeof Flag;
  count: number;
  label: string;
  empty: string;
}) {
  return (
    <li>
      <Link
        to={to}
        className="flex min-h-14 items-center gap-3 rounded-md border border-line bg-surface px-4 py-3 text-ink no-underline hover:border-line-strong"
      >
        <Icon
          aria-hidden="true"
          className={count > 0 ? "size-5 text-pine" : "size-5 text-ink-subtle"}
        />
        <span className="flex-1">
          {count > 0 ? (
            <>
              <span className="font-semibold">{count}</span> {label}
            </>
          ) : (
            <span className="text-ink-muted">{empty}</span>
          )}
        </span>
        {count > 0 ? <ChevronRight aria-hidden="true" className="size-5 text-pine" /> : null}
      </Link>
    </li>
  );
}

export default function Overview({ loaderData }: Route.ComponentProps) {
  const { counts, expiring, needsConfirmation } = loaderData;
  const [params] = useSearchParams();
  const review = counts.pendingJobs + counts.pendingRevisions + counts.pendingProfiles;
  return (
    <>
      <PageHeader
        title="Overview"
        description={`${counts.liveJobs} live listings${counts.pausedJobs ? `, ${counts.pausedJobs} paused` : ""}.`}
        actions={
          <Link to="/manage/jobs/new" className={buttonVariants()}>
            <Plus aria-hidden="true" />
            Add a vacancy
          </Link>
        }
      />
      <NoticeBanner />
      {params.has("welcome") ? (
        <Alert className="mb-5">
          <AlertTitle>Welcome, {loaderData.name}.</AlertTitle>
          <AlertDescription>
            Start with the review queue, then check listings that are closing soon.
          </AlertDescription>
        </Alert>
      ) : null}

      <section aria-labelledby="todo-heading">
        <h2 id="todo-heading" className="text-xl font-bold">
          Needs attention
        </h2>
        <ul className="mt-3 grid gap-2 md:grid-cols-2">
          <TaskRow
            to="/manage/review"
            icon={ClipboardCheck}
            count={review}
            label={review === 1 ? "item waiting for review" : "items waiting for review"}
            empty="Nothing waiting for review"
          />
          <TaskRow
            to="/manage/reports?status=open"
            icon={Flag}
            count={counts.openReports}
            label={counts.openReports === 1 ? "open report" : "open reports"}
            empty="No open reports"
          />
          <TaskRow
            to="#closing"
            icon={CalendarClock}
            count={expiring.length}
            label="closing within 7 days"
            empty="Nothing closing this week"
          />
          <TaskRow
            to="#confirm"
            icon={Timer}
            count={needsConfirmation.length}
            label={`not confirmed in ${RECONFIRM_AFTER_DAYS} days`}
            empty="All live listings recently confirmed"
          />
          <TaskRow
            to="/manage/employers?status=unverified"
            icon={ShieldQuestion}
            count={counts.unverifiedEmployers}
            label={
              counts.unverifiedEmployers === 1
                ? "employer not yet verified"
                : "employers not yet verified"
            }
            empty="All employers verified"
          />
        </ul>
      </section>

      <section aria-labelledby="results-heading" className="mt-8">
        <h2 id="results-heading" className="text-xl font-bold">
          Results
        </h2>
        <p className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <UserCheck aria-hidden="true" className="size-5 self-center text-pine" />
          <span className="text-2xl font-bold">{loaderData.hires.total}</span>
          <span>
            {loaderData.hires.total === 1 ? "person" : "people"} hired through Trabaho Biñan
            {loaderData.hires.total > 0
              ? `, ${loaderData.hires.last30Days} in the last 30 days`
              : ""}
            .
          </span>
          {loaderData.hires.total > 0 ? (
            <Link to="/manage/applications?status=hired" className="link">
              See who
            </Link>
          ) : null}
        </p>
        <p className="mt-1 text-sm text-ink-muted">
          Hires that employers record on applications made on this site. Listings that link to other
          sites are not counted.
        </p>
      </section>

      <div className="mt-8 grid gap-6 xl:grid-cols-2">
        <section
          id="closing"
          aria-labelledby="closing-heading"
          className="scroll-mt-6 rounded-lg border border-line bg-surface p-4"
        >
          <h2 id="closing-heading" className="text-xl font-bold">
            Closing within 7 days
          </h2>
          <p className="text-sm text-ink-muted">
            Renew only after the employer confirms the opening is still available.
          </p>
          {expiring.length === 0 ? (
            <p className="mt-3 text-ink-muted">No live listings close this week.</p>
          ) : (
            <ul className="mt-3 divide-y divide-line">
              {expiring.map((j) => (
                <li key={j.id} className="flex items-center justify-between gap-3 py-2">
                  <Link
                    to={`/manage/jobs/${j.id}`}
                    className="link min-w-0 [overflow-wrap:anywhere]"
                  >
                    {j.title}
                    <span className="block text-sm font-normal text-ink-muted no-underline">
                      {j.organizationName}
                    </span>
                  </Link>
                  <span className="shrink-0 text-sm font-semibold">
                    {daysUntil(new Date(j.deadlineAt)) <= 0 ? "Today" : formatDate(j.deadlineAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section
          id="confirm"
          aria-labelledby="confirm-heading"
          className="scroll-mt-6 rounded-lg border border-line bg-surface p-4"
        >
          <h2 id="confirm-heading" className="text-xl font-bold">
            Needs reconfirmation
          </h2>
          <p className="text-sm text-ink-muted">
            Live listings not confirmed open in the last {RECONFIRM_AFTER_DAYS} days.
          </p>
          {needsConfirmation.length === 0 ? (
            <p className="mt-3 text-ink-muted">Every live listing was confirmed recently.</p>
          ) : (
            <ul className="mt-3 divide-y divide-line">
              {needsConfirmation.map((j) => (
                <li key={j.id} className="flex items-center justify-between gap-3 py-2">
                  <Link
                    to={`/manage/jobs/${j.id}`}
                    className="link min-w-0 [overflow-wrap:anywhere]"
                  >
                    {j.title}
                    <span className="block text-sm font-normal text-ink-muted">
                      {j.organizationName}
                    </span>
                  </Link>
                  <span className="shrink-0 text-sm text-ink-muted">
                    {j.lastConfirmedAt ? describeAge(j.lastConfirmedAt) : "Never"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
