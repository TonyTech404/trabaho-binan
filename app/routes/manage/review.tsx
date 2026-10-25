import { ClipboardCheck, TriangleAlert } from "lucide-react";
import { Link } from "react-router";
import { revisionKindLabel } from "~/components/dashboard/job-panels";
import { PageHeader } from "~/components/dashboard/shell";
import { VerificationBadge } from "~/components/dashboard/status";
import { EmptyState } from "~/components/empty-state";
import { Badge } from "~/components/ui/badge";
import { getServices } from "~/lib/context.server";
import { findPolicyFlags } from "~/lib/policy-flags";
import { requireStaffViewer } from "~/lib/session.server";
import { describeAge } from "~/lib/time";
import { listReviewQueue } from "~/services/job-queries.server";
import type { Route } from "./+types/review";

export const meta = () => [{ title: "Review queue — Trabaho Biñan" }];

export async function loader({ request, context }: Route.LoaderArgs) {
  const viewer = await requireStaffViewer(request, context);
  const db = await getServices(context).db();
  const queue = await listReviewQueue(db, viewer);
  const flag = (t: { title: string; description: string; qualifications: string | null }) =>
    findPolicyFlags(t.title, t.description, t.qualifications).map((f) => f.label);
  return {
    items: [
      ...queue.pendingJobs.map((j) => ({
        key: `job-${j.id}`,
        href: `/manage/jobs/${j.id}`,
        title: j.title,
        kind: "New listing",
        organizationName: j.organizationName,
        organizationStatus: j.organizationStatus,
        submittedAt: j.submittedAt,
        flags: flag(j),
      })),
      ...queue.pendingRevisions.map((r) => ({
        key: `rev-${r.id}`,
        href: `/manage/jobs/${r.jobId}#revision`,
        title: r.title,
        kind: `${revisionKindLabel(r.kind)} of a ${r.jobStatus === "published" ? "live" : r.jobStatus} listing`,
        organizationName: r.organizationName,
        organizationStatus: r.organizationStatus,
        submittedAt: r.submittedAt,
        flags: flag(r),
      })),
      ...queue.pendingProfiles.map((o) => ({
        key: `org-${o.id}`,
        href: `/manage/employers/${o.id}#profile-changes`,
        title: "Company profile",
        kind: "Profile change",
        organizationName: o.organizationName,
        organizationStatus: o.organizationStatus,
        submittedAt: o.submittedAt,
        flags: findPolicyFlags("", o.pendingProfile?.description ?? "", null).map((f) => f.label),
      })),
    ].sort(
      (a, b) => new Date(a.submittedAt ?? 0).getTime() - new Date(b.submittedAt ?? 0).getTime(),
    ),
  };
}

export default function ReviewQueue({ loaderData }: Route.ComponentProps) {
  const { items } = loaderData;
  return (
    <>
      <PageHeader
        title="Review queue"
        description="Oldest first. Check the employer, the job details, the closing date and the way to apply."
      />
      {items.length === 0 ? (
        <EmptyState icon={ClipboardCheck} title="Nothing to review">
          <p>New submissions and changes to live listings will appear here.</p>
        </EmptyState>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => (
            <li
              key={item.key}
              className="relative rounded-lg border border-line bg-surface p-4 hover:border-line-strong"
            >
              <p className="text-sm text-ink-muted">
                {item.kind}, submitted {describeAge(item.submittedAt)}
              </p>
              <h2 className="mt-1 text-xl font-semibold [overflow-wrap:anywhere]">
                <Link
                  to={item.href}
                  className="text-ink no-underline after:absolute after:inset-0 hover:underline"
                >
                  {item.title}
                </Link>
              </h2>
              <p className="mt-1 flex flex-wrap items-center gap-2">
                {item.organizationName}
                <VerificationBadge status={item.organizationStatus} />
              </p>
              {item.flags.length ? (
                <p className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                  <TriangleAlert aria-hidden="true" className="size-4 text-gold-ink" />
                  {item.flags.map((f) => (
                    <Badge key={f} variant="warning">
                      {f}
                    </Badge>
                  ))}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
