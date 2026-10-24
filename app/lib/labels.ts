/** Human-readable labels for stored enum values. Shared by server and client. */

export const EMPLOYMENT_TYPES = {
  full_time: "Full-time",
  part_time: "Part-time",
  contract: "Contract",
  temporary: "Temporary / seasonal",
  internship: "Internship / OJT",
} as const;

export const WORK_SETUPS = {
  on_site: "On-site",
  hybrid: "Hybrid",
  remote: "Remote",
} as const;

/** Ordered from least to most; filters use "open to this level or below". */
export const EDUCATION_LEVELS = {
  none: "No formal requirement",
  elementary: "Elementary graduate",
  high_school: "High school graduate",
  senior_high: "Senior high school graduate",
  vocational: "Vocational / TESDA certificate",
  college_undergraduate: "College level",
  college_graduate: "College graduate",
  postgraduate: "Postgraduate",
} as const;

export const EXPERIENCE_LEVELS = {
  none: "No experience needed",
  under_1_year: "Less than 1 year",
  "1_to_2_years": "1–2 years",
  "3_to_5_years": "3–5 years",
  over_5_years: "More than 5 years",
} as const;

export const SALARY_PERIODS = {
  hour: "per hour",
  day: "per day",
  month: "per month",
  year: "per year",
} as const;

export const ORGANIZATION_TYPES = {
  direct_employer: "Direct employer",
  agency: "Recruitment agency",
} as const;

export const VERIFICATION_STATUSES = {
  unverified: "Not verified",
  verified: "Verified",
  suspended: "Suspended",
} as const;

export const JOB_STATUSES = {
  draft: "Draft",
  pending_review: "Pending review",
  changes_requested: "Changes requested",
  rejected: "Rejected",
  published: "Published",
  paused: "Paused",
  closed: "Closed",
  expired: "Expired",
  archived: "Archived",
} as const;

export const REVISION_KINDS = {
  edit: "Edit",
  renewal: "Renewal",
  reopen: "Reopen",
} as const;

export const REVISION_STATUSES = {
  draft: "Draft",
  pending_review: "Pending review",
  changes_requested: "Changes requested",
  approved: "Approved",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
} as const;

export const REPORT_REASONS = {
  scam_or_fee: "Possible scam or asks for fees",
  filled_or_expired: "Job is filled or no longer available",
  incorrect_information: "Incorrect or misleading information",
  discriminatory: "Discriminatory requirements",
  inappropriate: "Inappropriate content",
  other: "Something else",
} as const;

export const REPORT_STATUSES = {
  open: "Open",
  resolved: "Resolved",
  dismissed: "Dismissed",
} as const;

export const ROLES = {
  admin: "Administrator",
  reviewer: "Reviewer",
  employer: "Employer",
} as const;

export const CLOSE_REASONS = {
  filled: "Position filled",
  no_longer_hiring: "No longer hiring",
  other: "Other reason",
} as const;

export const JOB_EVENT_LABELS: Record<string, string> = {
  created: "Created",
  edited: "Edited",
  submitted: "Submitted for review",
  withdrawn: "Submission withdrawn",
  approved: "Approved and published",
  changes_requested: "Changes requested",
  rejected: "Rejected",
  paused: "Paused",
  resumed: "Resumed",
  closed: "Closed",
  expired: "Expired at deadline",
  archived: "Archived",
  renewed: "Renewed",
  reopened: "Reopened",
  revision_submitted: "Changes submitted for review",
  revision_approved: "Changes approved",
  revision_changes_requested: "Changes to revision requested",
  revision_rejected: "Revision rejected",
  revision_withdrawn: "Revision withdrawn",
};

export function label<T extends Record<string, string>>(map: T, key: string | null | undefined) {
  if (!key) return "—";
  return (map as Record<string, string>)[key] ?? key;
}

export function formatSalary(job: {
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency?: string | null;
  salaryPeriod: string | null;
}): string | null {
  const { salaryMin: min, salaryMax: max } = job;
  if (min == null && max == null) return null;
  const currency = job.salaryCurrency || "PHP";
  const fmt = (n: number) =>
    new Intl.NumberFormat("en-PH", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(n);
  const period = job.salaryPeriod ? ` ${label(SALARY_PERIODS, job.salaryPeriod)}` : "";
  if (min != null && max != null && min !== max) return `${fmt(min)} – ${fmt(max)}${period}`;
  if (min != null && max == null) return `From ${fmt(min)}${period}`;
  if (min == null && max != null) return `Up to ${fmt(max)}${period}`;
  return `${fmt(min as number)}${period}`;
}
