import {
  BadgeCheck,
  Banknote,
  BriefcaseBusiness,
  GraduationCap,
  MapPin,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "~/components/ui/badge";
import { EDUCATION_LEVELS, EMPLOYMENT_TYPES, formatSalary, label, WORK_SETUPS } from "~/lib/labels";
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
      <Icon aria-hidden="true" className="mt-[0.2em] size-4 shrink-0 text-ink-subtle" />
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
  educationLevel: string;
}

/** Location, pay, job type and education: the facts people filter on. */
export function JobFactsInline({ job }: { job: JobSummary }) {
  const salary = formatSalary(job);
  return (
    <div className="mt-2 flex flex-col gap-1 text-[0.9375rem] text-ink-muted">
      <Fact icon={MapPin}>{formatLocation(job)}</Fact>
      <Fact icon={Banknote} muted={!salary}>
        {salary ?? "Pay not disclosed"}
      </Fact>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        <Fact icon={BriefcaseBusiness}>{label(EMPLOYMENT_TYPES, job.employmentType)}</Fact>
        <Fact icon={GraduationCap}>{label(EDUCATION_LEVELS, job.educationLevel)}</Fact>
      </div>
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
