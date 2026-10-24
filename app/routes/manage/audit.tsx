import { ScrollText } from "lucide-react";
import { Form, Link, useSearchParams } from "react-router";
import { PageHeader } from "~/components/dashboard/shell";
import { EmptyState } from "~/components/empty-state";
import { Pagination } from "~/components/pagination";
import { Button } from "~/components/ui/button";
import { Label } from "~/components/ui/label";
import { NativeSelect, NativeSelectOption } from "~/components/ui/native-select";
import { getServices } from "~/lib/context.server";
import { requireAdminViewer } from "~/lib/session.server";
import { formatDateTime } from "~/lib/time";
import { listAuditEvents } from "~/services/audit.server";
import type { Route } from "./+types/audit";

export const meta = () => [{ title: "Audit history — Review dashboard" }];

const ENTITY_TYPES: Record<string, string> = {
  job: "Listings",
  organization: "Employers",
  user: "Accounts",
  account_link: "Invitations and reset links",
  listing_report: "Reports",
  settings: "Settings",
};

export async function loader({ request, context }: Route.LoaderArgs) {
  const viewer = await requireAdminViewer(request, context);
  const url = new URL(request.url);
  const raw = url.searchParams.get("type") ?? "";
  const entityType = Object.hasOwn(ENTITY_TYPES, raw) ? raw : "";
  const page = Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1;
  const db = await getServices(context).db();
  return { entityType, result: await listAuditEvents(db, viewer, { entityType, page }) };
}

export default function Audit({ loaderData }: Route.ComponentProps) {
  const { result, entityType } = loaderData;
  const [params] = useSearchParams();
  return (
    <>
      <PageHeader
        title="Audit history"
        description="Every sensitive change, who made it and when. Entries cannot be edited or deleted by the application."
      />
      <Form method="get" className="mb-4 flex flex-wrap items-end gap-3">
        <div className="w-64 space-y-1.5">
          <Label htmlFor="audit-type">Show</Label>
          <NativeSelect id="audit-type" name="type" defaultValue={entityType}>
            <NativeSelectOption value="">Everything</NativeSelectOption>
            {Object.entries(ENTITY_TYPES).map(([v, l]) => (
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
      {result.events.length === 0 ? (
        <EmptyState icon={ScrollText} title="No entries yet" />
      ) : (
        <>
          <ol className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
            {result.events.map((e) => (
              <li
                key={e.id}
                className="grid gap-1 px-4 py-3 md:grid-cols-[12rem_minmax(0,1fr)] md:gap-4"
              >
                <p className="text-sm text-ink-muted">{formatDateTime(e.createdAt)}</p>
                <div className="min-w-0">
                  <p className="[overflow-wrap:anywhere]">
                    <span className="font-semibold">
                      {e.actorName ?? (e.actorRole === "system" ? "System" : "Unknown")}
                    </span>
                    <span className="text-ink-muted"> ({e.action})</span>
                  </p>
                  {e.summary ? <p className="[overflow-wrap:anywhere]">{e.summary}</p> : null}
                  {e.entityType === "job" && e.entityId ? (
                    <Link to={`/manage/jobs/${e.entityId}`} className="link text-sm">
                      Open listing
                    </Link>
                  ) : e.entityType === "organization" && e.entityId ? (
                    <Link to={`/manage/employers/${e.entityId}`} className="link text-sm">
                      Open employer
                    </Link>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
          <Pagination page={result.page} pageCount={result.pageCount} searchParams={params} />
        </>
      )}
    </>
  );
}
