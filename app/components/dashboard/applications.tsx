import { Download, FileText, Inbox, Mail, Phone } from "lucide-react";
import { Form, Link, useNavigation } from "react-router";
import { ApplicationStatusBadge } from "~/components/dashboard/status";
import { EmptyState } from "~/components/empty-state";
import { Button, buttonVariants } from "~/components/ui/button";
import { Label } from "~/components/ui/label";
import { NativeSelect, NativeSelectOption } from "~/components/ui/native-select";
import { APPLICATION_STATUSES } from "~/lib/labels";
import { formatDateTime } from "~/lib/time";

interface ApplicationRow {
  id: string;
  reference: string;
  fullName: string;
  status: string;
  createdAt: Date | string;
  jobId: string;
  jobTitle: string;
  organizationName: string;
}

export function ApplicationFilters({
  status,
  jobId,
  jobTitle,
  basePath,
}: {
  status: string;
  jobId: string;
  jobTitle: string | null;
  basePath: string;
}) {
  return (
    <Form method="get" className="mb-4 flex flex-wrap items-end gap-3">
      {jobId ? <input type="hidden" name="job" value={jobId} /> : null}
      <div className="w-56 space-y-1.5">
        <Label htmlFor="application-status">Show</Label>
        <NativeSelect id="application-status" name="status" defaultValue={status}>
          <NativeSelectOption value="">All applications</NativeSelectOption>
          {Object.entries(APPLICATION_STATUSES).map(([v, l]) => (
            <NativeSelectOption key={v} value={v}>
              {l}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
      <Button type="submit" variant="outline">
        Apply
      </Button>
      {jobTitle ? (
        <p className="flex min-h-11 items-center gap-2 text-sm">
          For <span className="font-semibold">{jobTitle}</span>
          <Link to={`${basePath}${status ? `?status=${status}` : ""}`} className="link">
            Show all jobs
          </Link>
        </p>
      ) : null}
    </Form>
  );
}

export function ApplicationList({
  rows,
  basePath,
  showOrganization,
}: {
  rows: ApplicationRow[];
  basePath: string;
  showOrganization: boolean;
}) {
  if (rows.length === 0) {
    return (
      <EmptyState icon={Inbox} title="No applications yet">
        <p>
          Applications sent with a résumé on Trabaho Biñan appear here. Turn on “Accept applications
          on Trabaho Biñan” when you add or edit a job.
        </p>
      </EmptyState>
    );
  }
  return (
    <ul className="space-y-3">
      {rows.map((a) => (
        <li
          key={a.id}
          className="relative rounded-lg border border-line bg-surface p-4 hover:border-line-strong"
        >
          <div className="flex flex-wrap items-center gap-2">
            <ApplicationStatusBadge status={a.status} />
            <span className="text-sm text-ink-muted">Sent {formatDateTime(a.createdAt)}</span>
            <span className="text-sm text-ink-muted">Ref. {a.reference}</span>
          </div>
          <p className="mt-1.5 text-lg font-semibold">
            <Link
              to={`${basePath}/${a.id}`}
              className="text-ink no-underline after:absolute after:inset-0 after:content-[''] hover:text-pine hover:underline"
            >
              {a.fullName}
            </Link>
          </p>
          <p className="[overflow-wrap:anywhere] text-ink-muted">
            {a.jobTitle}
            {showOrganization ? ` at ${a.organizationName}` : ""}
          </p>
        </li>
      ))}
    </ul>
  );
}

export interface ApplicationDetailData {
  application: {
    id: string;
    reference: string;
    fullName: string;
    email: string | null;
    phone: string | null;
    message: string | null;
    resumeFilename: string;
    resumeSize: number;
    status: string;
    statusUpdatedAt: Date | string | null;
    createdAt: Date | string;
  };
  job: { id: string; title: string };
  organizationName: string;
}

function fileSize(bytes: number) {
  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function ApplicationDetail({
  data,
  jobPath,
}: {
  data: ApplicationDetailData;
  jobPath: string;
}) {
  const { application: a } = data;
  const navigation = useNavigation();
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="space-y-6">
        <section className="space-y-3 rounded-lg border border-line bg-surface p-4">
          <h2 className="text-xl font-bold">Contact</h2>
          <ul className="space-y-2">
            {a.email ? (
              <li className="flex items-center gap-2">
                <Mail aria-hidden="true" className="size-4.5 shrink-0 text-ink-subtle" />
                <a href={`mailto:${a.email}`} className="link [overflow-wrap:anywhere]">
                  {a.email}
                </a>
              </li>
            ) : null}
            {a.phone ? (
              <li className="flex items-center gap-2">
                <Phone aria-hidden="true" className="size-4.5 shrink-0 text-ink-subtle" />
                <a href={`tel:${a.phone.replace(/[^0-9+]/g, "")}`} className="link">
                  {a.phone}
                </a>
              </li>
            ) : null}
          </ul>
        </section>

        <section className="space-y-3 rounded-lg border border-line bg-surface p-4">
          <h2 className="text-xl font-bold">Résumé</h2>
          <p className="flex items-center gap-2 [overflow-wrap:anywhere]">
            <FileText aria-hidden="true" className="size-5 shrink-0 text-pine" />
            {a.resumeFilename}
            <span className="text-sm text-ink-muted">({fileSize(a.resumeSize)})</span>
          </p>
          <a
            href={`/applications/${a.id}/resume`}
            className={buttonVariants({ variant: "default" })}
            download
          >
            <Download aria-hidden="true" />
            Download résumé
          </a>
          <p className="text-sm text-ink-muted">
            Downloads are recorded. Keep the file private and delete local copies when you no longer
            need them.
          </p>
        </section>

        {a.message ? (
          <section className="space-y-2 rounded-lg border border-line bg-surface p-4">
            <h2 className="text-xl font-bold">Message</h2>
            <p className="whitespace-pre-line">{a.message}</p>
          </section>
        ) : null}
      </div>

      <aside className="space-y-4">
        <section className="space-y-3 rounded-lg border border-line bg-surface p-4">
          <h2 className="text-lg font-bold">Status</h2>
          <Form method="post" className="space-y-3">
            <Label htmlFor="status" className="sr-only">
              Status
            </Label>
            <NativeSelect id="status" name="status" defaultValue={a.status}>
              {Object.entries(APPLICATION_STATUSES).map(([v, l]) => (
                <NativeSelectOption key={v} value={v}>
                  {l}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <Button type="submit" variant="outline" disabled={navigation.state === "submitting"}>
              Save status
            </Button>
          </Form>
          {a.statusUpdatedAt ? (
            <p className="text-sm text-ink-muted">Updated {formatDateTime(a.statusUpdatedAt)}</p>
          ) : null}
        </section>
        <dl className="space-y-2 rounded-lg border border-line bg-surface p-4 text-sm">
          <div>
            <dt className="text-ink-muted">Job</dt>
            <dd>
              <Link to={jobPath} className="link [overflow-wrap:anywhere]">
                {data.job.title}
              </Link>
            </dd>
          </div>
          <div>
            <dt className="text-ink-muted">Employer</dt>
            <dd className="font-semibold">{data.organizationName}</dd>
          </div>
          <div>
            <dt className="text-ink-muted">Sent</dt>
            <dd className="font-semibold">{formatDateTime(a.createdAt)}</dd>
          </div>
          <div>
            <dt className="text-ink-muted">Reference</dt>
            <dd className="font-semibold">{a.reference}</dd>
          </div>
        </dl>
      </aside>
    </div>
  );
}
