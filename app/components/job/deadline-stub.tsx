import { cn } from "~/lib/utils";
import { daysUntil, formatLongDate, TIME_ZONE } from "~/lib/time";

const dayFmt = new Intl.DateTimeFormat("en-PH", { timeZone: TIME_ZONE, day: "numeric" });
const monthFmt = new Intl.DateTimeFormat("en-PH", { timeZone: TIME_ZONE, month: "short" });

export const CLOSING_SOON_DAYS = 3;

export function daysLeftLabel(days: number) {
  if (days <= 0) return "Last day";
  if (days === 1) return "1 day left";
  return `${days} days left`;
}

/**
 * The closing-date tab on every listing: the one thing a jobseeker needs to
 * see first after the title. Turns marigold in the last few days.
 */
export function DeadlineStub({
  deadlineAt,
  className,
  size = "list",
}: {
  deadlineAt: Date | string;
  className?: string;
  size?: "list" | "detail";
}) {
  const deadline = new Date(deadlineAt);
  const days = daysUntil(deadline);
  const soon = days <= CLOSING_SOON_DAYS;
  return (
    <div
      className={cn(
        "flex shrink-0 flex-col items-center justify-center text-center",
        size === "list"
          ? "w-[4.5rem] border-r-2 border-dashed px-1.5 py-3"
          : "w-24 rounded-md border-2 border-dashed px-2 py-3",
        soon ? "border-marigold bg-marigold-tint" : "border-lake/30 bg-lake-tint",
        className,
      )}
    >
      <span className="sr-only">
        Closes {formatLongDate(deadline)}, {daysLeftLabel(days).toLowerCase()}
      </span>
      <span aria-hidden="true" className="text-xs text-ink-muted">
        Closes
      </span>
      <span
        aria-hidden="true"
        className={cn(
          "font-heading leading-none font-bold text-ink",
          size === "list" ? "text-[1.75rem]" : "text-4xl",
        )}
      >
        {dayFmt.format(deadline)}
      </span>
      <span aria-hidden="true" className="text-sm font-semibold text-ink">
        {monthFmt.format(deadline)}
      </span>
      <span
        aria-hidden="true"
        className={cn(
          "mt-1 text-xs leading-tight font-semibold",
          soon ? "text-marigold-ink" : "text-lake-strong",
        )}
      >
        {daysLeftLabel(days)}
      </span>
    </div>
  );
}
