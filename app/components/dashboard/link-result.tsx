import { KeyRound } from "lucide-react";
import { CopyButton } from "~/components/copy-button";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { formatDateTime } from "~/lib/time";

/**
 * Shows a newly created invitation or reset link exactly once. Only a hash is
 * stored, so the link cannot be shown again; a new one must be created.
 */
export function OneTimeLink({
  url,
  expiresAt,
  purpose,
  email,
}: {
  url: string;
  expiresAt: Date | string;
  purpose: "invitation" | "password_reset";
  email: string;
}) {
  return (
    <Alert variant="success" className="mb-5">
      <KeyRound aria-hidden="true" />
      <AlertTitle>
        {purpose === "invitation"
          ? `Invitation link for ${email}`
          : `Password reset link for ${email}`}
      </AlertTitle>
      <AlertDescription className="text-ink">
        <p>
          Copy it now and send it to the person through an approved channel. It works once, expires{" "}
          {formatDateTime(expiresAt)}, and will not be shown again.
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <label htmlFor="one-time-link" className="sr-only">
            Link
          </label>
          <input
            id="one-time-link"
            readOnly
            value={url}
            onFocus={(e) => e.currentTarget.select()}
            className="h-11 min-w-0 flex-1 basis-full rounded-md border border-line-strong bg-surface px-3 font-mono text-sm sm:basis-auto"
          />
          <CopyButton text={url} label="Copy link" />
        </div>
      </AlertDescription>
    </Alert>
  );
}
