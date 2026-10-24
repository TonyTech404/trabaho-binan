import { ExternalLink, Mail, MapPinned, ShieldAlert } from "lucide-react";
import { Link } from "react-router";
import { CopyButton } from "~/components/copy-button";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { buttonVariants } from "~/components/ui/button";
import { JobText } from "./job-text";

interface ApplyInfo {
  publicId: string;
  applicationUrl: string | null;
  applicationEmail: string | null;
  walkInInstructions: string | null;
  applicationNotes: string | null;
}

function hostname(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/**
 * The application instructions. Links go through /apply/:id, which records
 * the click and re-checks that the vacancy is still open before redirecting.
 */
export function ApplyPanel({ job, open }: { job: ApplyInfo; open: boolean }) {
  const methods = [job.applicationUrl, job.applicationEmail, job.walkInInstructions].filter(
    Boolean,
  ).length;
  return (
    <section
      id="how-to-apply"
      aria-labelledby="apply-heading"
      className="scroll-mt-4 overflow-hidden rounded-lg border-2 border-lake bg-surface"
    >
      <div className="bg-lake px-4 py-3 text-white">
        <h2 id="apply-heading" className="text-2xl font-bold">
          How to apply
        </h2>
        <p lang="fil" className="text-sm text-white/85">
          Paano mag-apply
        </p>
      </div>

      <div className="space-y-5 px-4 py-4">
        {!open ? (
          <p className="font-semibold">Applications are closed for this listing.</p>
        ) : (
          <>
            {methods > 1 ? (
              <p className="text-ink-muted">Use any one of these ways to apply.</p>
            ) : null}

            {job.applicationUrl ? (
              <div className="space-y-2">
                <h3 className="text-lg font-semibold">Apply online</h3>
                <a
                  href={`/apply/${job.publicId}?via=url`}
                  rel="noopener noreferrer nofollow"
                  className={buttonVariants({ size: "lg", className: "w-full" })}
                >
                  Open the application page
                  <ExternalLink aria-hidden="true" />
                </a>
                <p className="text-sm text-ink-muted">
                  Opens a page on{" "}
                  <span className="font-semibold text-ink">{hostname(job.applicationUrl)}</span>,
                  the employer's site.
                </p>
              </div>
            ) : null}

            {job.applicationEmail ? (
              <div className="space-y-2">
                <h3 className="flex items-center gap-2 text-lg font-semibold">
                  <Mail aria-hidden="true" className="size-5 text-lake" />
                  Email your application
                </h3>
                <p className="flex flex-wrap items-center gap-2">
                  <a
                    href={`/apply/${job.publicId}?via=email`}
                    className="link text-lg [overflow-wrap:anywhere]"
                  >
                    {job.applicationEmail}
                  </a>
                  <CopyButton text={job.applicationEmail} label="Copy address" />
                </p>
              </div>
            ) : null}

            {job.walkInInstructions ? (
              <div className="space-y-2">
                <h3 className="flex items-center gap-2 text-lg font-semibold">
                  <MapPinned aria-hidden="true" className="size-5 text-lake" />
                  Apply in person
                </h3>
                <JobText text={job.walkInInstructions} className="prose-job" />
              </div>
            ) : null}

            {job.applicationNotes ? (
              <div className="space-y-2 border-t border-line pt-4">
                <h3 className="text-lg font-semibold">What to prepare</h3>
                <JobText text={job.applicationNotes} className="prose-job" />
              </div>
            ) : null}
          </>
        )}

        <Alert variant="warning">
          <ShieldAlert aria-hidden="true" />
          <AlertTitle>Never pay to apply</AlertTitle>
          <AlertDescription>
            Employers should not ask for placement, training or processing fees.{" "}
            <Link to={`/report/${job.publicId}`} className="font-semibold text-ink">
              Report this listing
            </Link>{" "}
            if anyone asks you to pay.
          </AlertDescription>
        </Alert>
      </div>
    </section>
  );
}
