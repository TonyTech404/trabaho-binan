import { CircleSlash, Clock3, PauseCircle } from "lucide-react";
import { Link } from "react-router";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { CLOSE_REASONS, label } from "~/lib/labels";
import { formatLongDate } from "~/lib/time";
import type { PublicJobState } from "~/services/public-jobs.server";

export function JobStatusNotice({
  state,
  closedReason,
  closedAt,
  deadlineAt,
}: {
  state: PublicJobState;
  closedReason: string | null;
  closedAt: Date | string | null;
  deadlineAt: Date | string;
}) {
  if (state === "open") return null;
  const browse = (
    <Link to="/" className="font-semibold text-ink">
      Browse open jobs
    </Link>
  );
  if (state === "paused") {
    return (
      <Alert variant="warning" role="status">
        <PauseCircle aria-hidden="true" />
        <AlertTitle>This listing is temporarily unavailable</AlertTitle>
        <AlertDescription>
          It is being reviewed and is not accepting applications for now. Check back later, or{" "}
          <Link to="/" className="font-semibold text-ink">
            browse other open jobs
          </Link>
          .
        </AlertDescription>
      </Alert>
    );
  }
  if (state === "expired") {
    return (
      <Alert variant="danger" role="status">
        <Clock3 aria-hidden="true" />
        <AlertTitle>Applications closed on {formatLongDate(deadlineAt)}</AlertTitle>
        <AlertDescription>The deadline for this vacancy has passed. {browse}.</AlertDescription>
      </Alert>
    );
  }
  return (
    <Alert variant="danger" role="status">
      <CircleSlash aria-hidden="true" />
      <AlertTitle>This vacancy is closed</AlertTitle>
      <AlertDescription>
        {closedReason ? `${label(CLOSE_REASONS, closedReason)}. ` : ""}
        {closedAt ? `Closed on ${formatLongDate(closedAt)}. ` : ""}
        The employer is no longer accepting applications through this listing. {browse}.
      </AlertDescription>
    </Alert>
  );
}
