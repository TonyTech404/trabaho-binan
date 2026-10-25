import {
  Download,
  Eye,
  FileText,
  Image as ImageIcon,
  Inbox,
  Mail,
  MessageSquare,
  Phone,
} from "lucide-react";
import { Form, Link, useNavigation } from "react-router";
import { ApplicationStatusBadge } from "~/components/dashboard/status";
import { EmptyState } from "~/components/empty-state";
import { Button, buttonVariants } from "~/components/ui/button";
import { Label } from "~/components/ui/label";
import { NativeSelect, NativeSelectOption } from "~/components/ui/native-select";
import { APPLICATION_STATUSES } from "~/lib/labels";
import { formatDateTime } from "~/lib/time";
import { formatPhMobile } from "~/lib/validation";

interface ApplicationRow {
  id: string;
  reference: string;
  fullName: string;
  phone: string | null;
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
          {a.phone ? <p className="text-sm text-ink-muted">{formatPhMobile(a.phone)}</p> : null}
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
    experience: string | null;
    message: string | null;
    status: string;
    statusUpdatedAt: Date | string | null;
    createdAt: Date | string;
  };
  files: { id: string; filename: string; contentType: string; size: number }[];
  job: { id: string; title: string; status: string; openings: number | null };
  organizationName: string;
  hires: number;
  waiting: number;
}

function fileSize(bytes: number) {
  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function Files({ data }: { data: ApplicationDetailData }) {
  const { application: a, files } = data;
  const url = (id: string, view = false) =>
    `/applications/${a.id}/files/${id}${view ? "?view=1" : ""}`;
  return (
    <section className="space-y-3 rounded-lg border border-line bg-surface p-4">
      <h2 className="text-xl font-bold">Résumé and files</h2>
      {files.length === 0 ? (
        <p className="text-ink-muted">No files attached.</p>
      ) : (
        <ul className="space-y-4">
          {files.map((f) => {
            // Photos open in the browser; documents always download.
            const image = f.contentType.startsWith("image/");
            return (
              <li key={f.id} className="space-y-2">
                {image ? (
                  <a href={url(f.id, true)} target="_blank" rel="noopener" className="block w-fit">
                    <img
                      src={url(f.id, true)}
                      alt={`Sent by ${a.fullName}: ${f.filename}`}
                      className="max-h-72 rounded-md border border-line object-contain"
                      loading="lazy"
                    />
                  </a>
                ) : null}
                <p className="flex items-center gap-2 [overflow-wrap:anywhere]">
                  {image ? (
                    <ImageIcon aria-hidden="true" className="size-5 shrink-0 text-pine" />
                  ) : (
                    <FileText aria-hidden="true" className="size-5 shrink-0 text-pine" />
                  )}
                  {f.filename}
                  <span className="text-sm text-ink-muted">({fileSize(f.size)})</span>
                </p>
                <div className="flex flex-wrap gap-2">
                  {image ? (
                    <a
                      href={url(f.id, true)}
                      target="_blank"
                      rel="noopener"
                      className={buttonVariants({ variant: "outline", size: "sm" })}
                    >
                      <Eye aria-hidden="true" />
                      Open<span className="sr-only"> {f.filename} (opens in a new tab)</span>
                    </a>
                  ) : null}
                  <a
                    href={url(f.id)}
                    className={buttonVariants({ variant: "outline", size: "sm" })}
                    download
                  >
                    <Download aria-hidden="true" />
                    Download<span className="sr-only"> {f.filename}</span>
                  </a>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-sm text-ink-muted">
        Every view and download is recorded. Keep these files private and delete local copies when
        you no longer need them.
      </p>
    </section>
  );
}

/** After a hire: close the job and let the other applicants know. */
function FilledPanel({ data }: { data: ApplicationDetailData }) {
  const navigation = useNavigation();
  const { job, hires, waiting } = data;
  const jobOpen = job.status === "published" || job.status === "paused";
  if (data.application.status !== "hired" || (!jobOpen && waiting === 0)) return null;
  const someLeft = job.openings != null && hires < job.openings;
  return (
    <section className="space-y-3 rounded-lg border-2 border-pine bg-pine-tint p-4">
      <h2 className="text-lg font-bold">{jobOpen ? "Position filled?" : "Let the others know"}</h2>
      {jobOpen ? (
        <p>
          {someLeft
            ? `${hires} of ${job.openings} openings filled. Close the job when every opening is filled.`
            : "Close the job so it leaves the listings and stops taking applications."}
        </p>
      ) : null}
      <Form method="post" className="space-y-3">
        <input type="hidden" name="intent" value="close_job" />
        {waiting > 0 ? (
          <label className="flex cursor-pointer gap-3">
            <input
              type="checkbox"
              name="notifyOthers"
              defaultChecked={!someLeft}
              className="mt-1 size-5 shrink-0 accent-pine"
            />
            <span>
              Mark the {waiting === 1 ? "other applicant" : `${waiting} other applicants`} still
              waiting as <strong>Not selected</strong>, so they can see it when they check their
              application.
            </span>
          </label>
        ) : null}
        <Button type="submit" disabled={navigation.state === "submitting"}>
          {jobOpen ? "Close job" : "Update the others"}
        </Button>
      </Form>
    </section>
  );
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
  const phone = a.phone ? formatPhMobile(a.phone) : null;
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="space-y-6">
        <section className="space-y-3 rounded-lg border border-line bg-surface p-4">
          <h2 className="text-xl font-bold">Contact</h2>
          {a.phone ? (
            <div className="space-y-2">
              <p className="flex items-center gap-2 text-lg font-semibold">
                <Phone aria-hidden="true" className="size-5 shrink-0 text-ink-subtle" />
                {phone}
              </p>
              <div className="flex flex-wrap gap-2">
                <a href={`tel:${a.phone}`} className={buttonVariants({ variant: "default" })}>
                  <Phone aria-hidden="true" />
                  Call
                </a>
                <a href={`sms:${a.phone}`} className={buttonVariants({ variant: "outline" })}>
                  <MessageSquare aria-hidden="true" />
                  Text
                </a>
              </div>
            </div>
          ) : null}
          {a.email ? (
            <p className="flex items-center gap-2">
              <Mail aria-hidden="true" className="size-4.5 shrink-0 text-ink-subtle" />
              <a href={`mailto:${a.email}`} className="link [overflow-wrap:anywhere]">
                {a.email}
              </a>
            </p>
          ) : null}
        </section>

        {a.experience ? (
          <section className="space-y-2 rounded-lg border border-line bg-surface p-4">
            <h2 className="text-xl font-bold">Work experience</h2>
            <p className="whitespace-pre-line">{a.experience}</p>
          </section>
        ) : null}

        <Files data={data} />

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
            <input type="hidden" name="intent" value="status" />
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
          <p className="text-sm text-ink-muted">
            The applicant can see this status with their reference number.
          </p>
        </section>
        <FilledPanel data={data} />
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
