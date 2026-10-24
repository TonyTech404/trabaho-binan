import { CalendarClock, Clock } from "lucide-react";
import { daysUntil, formatLongDate, manilaDateString, TIME_ZONE } from "~/lib/time";
import { cn } from "~/lib/utils";

export const CLOSING_SOON_DAYS = 3;

const sameYearFmt = new Intl.DateTimeFormat("en-PH", {
  timeZone: TIME_ZONE,
  month: "short",
  day: "numeric",
});
const otherYearFmt = new Intl.DateTimeFormat("en-PH", {
  timeZone: TIME_ZONE,
  month: "short",
  day: "numeric",
  year: "numeric",
});

export function daysLeftLabel(days: number) {
  if (days <= 0) return "last day";
  if (days === 1) return "1 day left";
  return `${days} days left`;
}

function shortDate(deadline: Date) {
  const sameYear = manilaDateString(deadline).slice(0, 4) === manilaDateString().slice(0, 4);
  return (sameYear ? sameYearFmt : otherYearFmt).format(deadline);
}

/**
 * The closing date, kept compact and secondary to the job facts. It only
 * draws attention (gold) in the last few days before the deadline.
 */
export function DeadlineNote({
  deadlineAt,
  className,
}: {
  deadlineAt: Date | string;
  className?: string;
}) {
  const deadline = new Date(deadlineAt);
  const days = daysUntil(deadline);
  if (days <= CLOSING_SOON_DAYS) {
    const when = days <= 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`;
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-sm border border-gold bg-gold-tint px-1.5 font-semibold text-gold-ink",
          className,
        )}
      >
        <Clock aria-hidden="true" className="size-3.5 shrink-0" />
        Closes {when}
        <span className="sr-only">, {formatLongDate(deadline)}</span>
      </span>
    );
  }
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <CalendarClock aria-hidden="true" className="size-4 shrink-0 text-ink-subtle" />
      Closes {shortDate(deadline)}
    </span>
  );
}

export function isClosingSoon(deadlineAt: Date | string) {
  return daysUntil(new Date(deadlineAt)) <= CLOSING_SOON_DAYS;
}
