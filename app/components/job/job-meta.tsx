import { BadgeCheck, Banknote, BriefcaseBusiness, MapPin, type LucideIcon } from "lucide-react";
import { Badge } from "~/components/ui/badge";
import { EMPLOYMENT_TYPES, formatSalary, label, WORK_SETUPS } from "~/lib/labels";
import { cn } from "~/lib/utils";

export function formatLocation(job: {
  workBarangay?: string | null;
  workCity: string;
  workSetup?: string | null;
}) {
  const place = [job.workBarangay, job.workCity].filter(Boolean).join(", ");
  if (job.workSetup === "remote") return `Remote (based in ${job.workCity})`;
  if (job.workSetup === "hybrid") return `${place} (hybrid)`;
  return place;
}

export function Fact({
  icon: Icon,
  children,
  muted,
  className,
}: {
  icon: LucideIcon;
  children: React.ReactNode;
  muted?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex min-w-0 items-start gap-1.5",
        muted && "text-ink-subtle",
        className,
      )}
    >
      {/* A 1lh box centres the icon on the first line at any font size. */}
      <span aria-hidden="true" className="flex h-lh shrink-0 items-center">
        <Icon className="size-4 text-ink-subtle" />
      </span>
      <span className="min-w-0">{children}</span>
    </span>
  );
}

export interface JobSummary {
  workBarangay: string | null;
  workCity: string;
  workSetup: string;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string;
  salaryPeriod: string | null;
  employmentType: string;
}

/** Where, pay and job type: the facts people decide on, in that order. */
export function JobFactsInline({ job }: { job: JobSummary }) {
  const salary = formatSalary(job);
  return (
    <div className="mt-2.5 flex flex-col gap-1 text-[1rem] text-ink sm:flex-row sm:flex-wrap sm:gap-x-5">
      <Fact icon={MapPin}>{formatLocation(job)}</Fact>
      <Fact icon={Banknote} muted={!salary} className={salary ? "font-semibold" : undefined}>
        {salary ?? "Pay not disclosed"}
      </Fact>
      <Fact icon={BriefcaseBusiness}>{label(EMPLOYMENT_TYPES, job.employmentType)}</Fact>
    </div>
  );
}

export function VerifiedBadge() {
  return (
    <Badge variant="success">
      <BadgeCheck aria-hidden="true" />
      Verified employer
    </Badge>
  );
}

export function workSetupLabel(value: string) {
  return label(WORK_SETUPS, value);
}
