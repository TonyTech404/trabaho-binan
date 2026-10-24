import { Badge } from "~/components/ui/badge";
import {
  JOB_STATUSES,
  REPORT_STATUSES,
  REVISION_STATUSES,
  VERIFICATION_STATUSES,
} from "~/lib/labels";

type Tone = "neutral" | "info" | "success" | "warning" | "danger";

const JOB_TONES: Record<string, Tone> = {
  draft: "neutral",
  pending_review: "info",
  changes_requested: "warning",
  rejected: "danger",
  published: "success",
  paused: "warning",
  closed: "neutral",
  expired: "neutral",
  archived: "neutral",
};

export function JobStatusBadge({
  status,
  deadlinePassed,
}: {
  status: string;
  deadlinePassed?: boolean;
}) {
  if (status === "published" && deadlinePassed)
    return <Badge variant="neutral">Expired (pending sweep)</Badge>;
  return (
    <Badge variant={JOB_TONES[status] ?? "neutral"}>
      {JOB_STATUSES[status as keyof typeof JOB_STATUSES] ?? status}
    </Badge>
  );
}

export function RevisionStatusBadge({ status }: { status: string }) {
  const tone: Tone =
    status === "pending_review"
      ? "info"
      : status === "changes_requested"
        ? "warning"
        : status === "approved"
          ? "success"
          : status === "rejected"
            ? "danger"
            : "neutral";
  return (
    <Badge variant={tone}>
      {REVISION_STATUSES[status as keyof typeof REVISION_STATUSES] ?? status}
    </Badge>
  );
}

export function VerificationBadge({ status }: { status: string }) {
  const tone: Tone =
    status === "verified" ? "success" : status === "suspended" ? "danger" : "neutral";
  return (
    <Badge variant={tone}>
      {VERIFICATION_STATUSES[status as keyof typeof VERIFICATION_STATUSES] ?? status}
    </Badge>
  );
}

export function ReportStatusBadge({ status }: { status: string }) {
  const tone: Tone = status === "open" ? "warning" : status === "resolved" ? "success" : "neutral";
  return (
    <Badge variant={tone}>
      {REPORT_STATUSES[status as keyof typeof REPORT_STATUSES] ?? status}
    </Badge>
  );
}
