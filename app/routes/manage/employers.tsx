import { Building2, Plus } from "lucide-react";
import { Form, Link } from "react-router";
import { PageHeader } from "~/components/dashboard/shell";
import { VerificationBadge } from "~/components/dashboard/status";
import { NoticeBanner } from "~/components/dashboard/notice";
import { EmptyState } from "~/components/empty-state";
import { Button, buttonVariants } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { NativeSelect, NativeSelectOption } from "~/components/ui/native-select";
import { getServices } from "~/lib/context.server";
import { label, ORGANIZATION_TYPES, VERIFICATION_STATUSES } from "~/lib/labels";
import { requireStaffViewer } from "~/lib/session.server";
import { listOrganizations } from "~/services/organizations.server";
import type { Route } from "./+types/employers";

export const meta = () => [{ title: "Employers — Review dashboard" }];

export async function loader({ request, context }: Route.LoaderArgs) {
  const viewer = await requireStaffViewer(request, context);
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 100);
  const raw = url.searchParams.get("status") ?? "";
  const status = Object.hasOwn(VERIFICATION_STATUSES, raw)
    ? (raw as keyof typeof VERIFICATION_STATUSES)
    : "";
  const db = await getServices(context).db();
  return { q, status, organizations: await listOrganizations(db, viewer, { q, status }) };
}

export default function Employers({ loaderData }: Route.ComponentProps) {
  const { organizations, q, status } = loaderData;
  return (
    <>
      <PageHeader
        title="Employers"
        description="Organizations that post vacancies. Verification is separate from approving a listing."
        actions={
          <Link to="/manage/employers/new" className={buttonVariants()}>
            <Plus aria-hidden="true" />
            Add employer
          </Link>
        }
      />
      <NoticeBanner />
      <Form method="get" className="mb-4 flex flex-wrap items-end gap-3">
        <div className="min-w-56 flex-1 space-y-1.5">
          <Label htmlFor="org-q">Search</Label>
          <Input
            id="org-q"
            name="q"
            type="search"
            defaultValue={q}
            placeholder="Organization name"
          />
        </div>
        <div className="w-48 space-y-1.5">
          <Label htmlFor="org-status">Verification</Label>
          <NativeSelect id="org-status" name="status" defaultValue={status}>
            <NativeSelectOption value="">Any</NativeSelectOption>
            {Object.entries(VERIFICATION_STATUSES).map(([v, l]) => (
              <NativeSelectOption key={v} value={v}>
                {l}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        <Button type="submit" variant="outline">
          Apply
        </Button>
      </Form>
      {organizations.length === 0 ? (
        <EmptyState
          icon={Building2}
          title={q || status ? "No employers match" : "No employers yet"}
          actions={
            <Link to="/manage/employers/new" className={buttonVariants()}>
              Add employer
            </Link>
          }
        >
          <p>Add an employer before creating their vacancies or inviting their staff.</p>
        </EmptyState>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
          {organizations.map((o) => (
            <li
              key={o.id}
              className="relative flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-canvas"
            >
              <div className="min-w-0 flex-1">
                <Link
                  to={`/manage/employers/${o.id}`}
                  className="font-semibold [overflow-wrap:anywhere] text-ink no-underline after:absolute after:inset-0 hover:underline"
                >
                  {o.name}
                </Link>
                <p className="text-sm text-ink-muted">
                  {label(ORGANIZATION_TYPES, o.type)}
                  {o.officeCity ? `, ${o.officeCity}` : ""}
                </p>
              </div>
              <span className="text-sm text-ink-muted">
                {o.activeJobs} live, {o.members} {o.members === 1 ? "account" : "accounts"}
              </span>
              <VerificationBadge status={o.verificationStatus} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
