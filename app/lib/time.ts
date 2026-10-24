/**
 * Dates are stored as UTC timestamps and shown in Philippine time (UTC+8,
 * no daylight saving). A deadline date means "until the end of that day in
 * Manila".
 */
export const TIME_ZONE = "Asia/Manila";
const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** YYYY-MM-DD for the given instant in Manila. */
export function manilaDateString(date: Date = new Date()): string {
  return new Date(date.getTime() + MANILA_OFFSET_MS).toISOString().slice(0, 10);
}

/** End of the given Manila calendar day (23:59:59.999 +08:00) as a UTC Date. */
export function endOfManilaDay(dateString: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) throw new Error(`Invalid date: ${dateString}`);
  const startUtc = Date.parse(`${dateString}T00:00:00.000Z`);
  if (Number.isNaN(startUtc)) throw new Error(`Invalid date: ${dateString}`);
  return new Date(startUtc - MANILA_OFFSET_MS + DAY_MS - 1);
}

export function addDaysToDateString(dateString: string, days: number): string {
  const d = new Date(`${dateString}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Whole calendar days from today (Manila) until the deadline's Manila date. */
export function daysUntil(deadline: Date, now: Date = new Date()): number {
  const a = Date.parse(`${manilaDateString(now)}T00:00:00Z`);
  const b = Date.parse(`${manilaDateString(deadline)}T00:00:00Z`);
  return Math.round((b - a) / DAY_MS);
}

const dateFormatter = new Intl.DateTimeFormat("en-PH", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "short",
  day: "numeric",
});

const dateTimeFormatter = new Intl.DateTimeFormat("en-PH", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

const longDateFormatter = new Intl.DateTimeFormat("en-PH", {
  timeZone: TIME_ZONE,
  weekday: "short",
  year: "numeric",
  month: "long",
  day: "numeric",
});

type DateInput = Date | string | null | undefined;

function toDate(value: DateInput): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatDate(value: DateInput): string {
  const d = toDate(value);
  return d ? dateFormatter.format(d) : "—";
}

export function formatLongDate(value: DateInput): string {
  const d = toDate(value);
  return d ? longDateFormatter.format(d) : "—";
}

export function formatDateTime(value: DateInput): string {
  const d = toDate(value);
  return d ? dateTimeFormatter.format(d) : "—";
}

/** "Closes today", "Closes tomorrow", "Closes in 5 days", "Closed". */
export function describeDeadline(value: DateInput, now: Date = new Date()): string {
  const d = toDate(value);
  if (!d) return "No deadline";
  if (d.getTime() <= now.getTime()) return "Closed";
  const days = daysUntil(d, now);
  if (days <= 0) return "Closes today";
  if (days === 1) return "Closes tomorrow";
  return `Closes in ${days} days`;
}

/** "today", "yesterday", "3 days ago", or a date for older values. */
export function describeAge(value: DateInput, now: Date = new Date()): string {
  const d = toDate(value);
  if (!d) return "—";
  const days = -daysUntil(d, now);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 14) return `${days} days ago`;
  return formatDate(d);
}
