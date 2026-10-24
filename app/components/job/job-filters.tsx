import { SlidersHorizontal } from "lucide-react";
import { useEffect, useRef } from "react";
import { Button } from "~/components/ui/button";
import { Label } from "~/components/ui/label";
import { NativeSelect, NativeSelectOption } from "~/components/ui/native-select";
import {
  EDUCATION_LEVELS,
  EMPLOYMENT_TYPES,
  EXPERIENCE_LEVELS,
  ORGANIZATION_TYPES,
  WORK_SETUPS,
} from "~/lib/labels";
import type { PublicJobFilters } from "~/services/public-jobs.server";

export const FILTER_KEYS = [
  "city",
  "type",
  "setup",
  "education",
  "experience",
  "employer",
] as const;

export function activeFilterCount(filters: PublicJobFilters) {
  return FILTER_KEYS.filter((k) => filters[k]).length;
}

function SelectField({
  id,
  label,
  hint,
  name,
  value,
  anyLabel,
  options,
}: {
  id: string;
  label: string;
  hint?: string;
  name: string;
  value: string;
  anyLabel: string;
  options: [string, string][];
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {hint ? (
        <p id={`${id}-hint`} className="text-sm text-ink-subtle">
          {hint}
        </p>
      ) : null}
      <NativeSelect
        id={id}
        name={name}
        defaultValue={value}
        aria-describedby={hint ? `${id}-hint` : undefined}
      >
        <NativeSelectOption value="">{anyLabel}</NativeSelectOption>
        {options.map(([v, l]) => (
          <NativeSelectOption key={v} value={v}>
            {l}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </div>
  );
}

/**
 * Filters live inside the search <Form> (GET), so the URL is shareable and
 * everything works without JavaScript. On small screens they collapse into a
 * disclosure; on wide screens they open automatically.
 */
export function JobFilters({
  filters,
  cities,
}: {
  filters: PublicJobFilters;
  cities: { city: string; total: number }[];
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  const count = activeFilterCount(filters);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 64rem)");
    if (mq.matches && ref.current) ref.current.open = true;
  }, []);

  const cityOptions: [string, string][] = cities.map((c) => [c.city, `${c.city} (${c.total})`]);
  if (filters.city && !cities.some((c) => c.city.toLowerCase() === filters.city.toLowerCase())) {
    cityOptions.push([filters.city, `${filters.city} (0)`]);
  }

  return (
    <details
      ref={ref}
      open={count > 0 || undefined}
      className="group rounded-lg border border-line bg-surface lg:border-0 lg:bg-transparent"
    >
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 rounded-lg px-4 font-semibold lg:hidden [&::-webkit-details-marker]:hidden">
        <SlidersHorizontal aria-hidden="true" className="size-5 text-pine" />
        Filters
        {count > 0 ? (
          <span className="rounded-sm bg-pine px-1.5 text-sm text-white">{count}</span>
        ) : null}
        <span className="ml-auto text-sm font-normal text-ink-muted group-open:hidden">Show</span>
        <span className="ml-auto hidden text-sm font-normal text-ink-muted group-open:inline">
          Hide
        </span>
      </summary>
      <fieldset className="space-y-4 border-t border-line px-4 pt-4 pb-5 lg:border-0 lg:p-0">
        <legend className="sr-only">Filter jobs</legend>
        <SelectField
          id="f-city"
          name="city"
          label="Work location"
          value={filters.city}
          anyLabel="Any location"
          options={cityOptions}
        />
        <SelectField
          id="f-type"
          name="type"
          label="Job type"
          value={filters.type}
          anyLabel="Any job type"
          options={Object.entries(EMPLOYMENT_TYPES)}
        />
        <SelectField
          id="f-education"
          name="education"
          label="Your education"
          hint="Shows jobs open to this level or lower."
          value={filters.education}
          anyLabel="Any education"
          options={Object.entries(EDUCATION_LEVELS)}
        />
        <SelectField
          id="f-experience"
          name="experience"
          label="Your work experience"
          hint="Shows jobs that ask for this much or less."
          value={filters.experience}
          anyLabel="Any experience"
          options={Object.entries(EXPERIENCE_LEVELS)}
        />
        <SelectField
          id="f-employer"
          name="employer"
          label="Posted by"
          value={filters.employer}
          anyLabel="Employers and agencies"
          options={Object.entries(ORGANIZATION_TYPES)}
        />
        <SelectField
          id="f-setup"
          name="setup"
          label="Work setup"
          value={filters.setup}
          anyLabel="Any setup"
          options={Object.entries(WORK_SETUPS)}
        />
        <Button type="submit" className="w-full">
          Show jobs
        </Button>
      </fieldset>
    </details>
  );
}
