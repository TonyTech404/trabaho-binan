import { Search, SearchX, X } from "lucide-react";
import { Form, Link, useNavigation, useSearchParams } from "react-router";
import { EmptyState } from "~/components/empty-state";
import { activeFilterCount, FILTER_KEYS, JobFilters } from "~/components/job/job-filters";
import { JobListItem } from "~/components/job/job-list-item";
import { Pagination } from "~/components/pagination";
import { Button, buttonVariants } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { NativeSelect, NativeSelectOption } from "~/components/ui/native-select";
import { getServices } from "~/lib/context.server";
import {
  EDUCATION_LEVELS,
  EMPLOYMENT_TYPES,
  EXPERIENCE_LEVELS,
  label,
  ORGANIZATION_TYPES,
  WORK_SETUPS,
} from "~/lib/labels";
import { PUBLIC_LIST_TTL_SECONDS, publicCacheControl } from "~/lib/public-cache.server";
import { cn } from "~/lib/utils";
import {
  listActiveCities,
  parsePublicFilters,
  searchPublicJobs,
  type PublicJobFilters,
} from "~/services/public-jobs.server";
import type { Route } from "./+types/home";

export async function loader({ request, context }: Route.LoaderArgs) {
  const db = await getServices(context).db();
  const filters = parsePublicFilters(new URL(request.url).searchParams);
  const [result, cities] = await Promise.all([searchPublicJobs(db, filters), listActiveCities(db)]);
  return { filters, result, cities };
}

export function headers() {
  return { "Cache-Control": publicCacheControl(PUBLIC_LIST_TTL_SECONDS) };
}

export function meta({ loaderData }: Route.MetaArgs) {
  const q = loaderData?.filters.q;
  return [
    { title: q ? `Jobs matching “${q}” — Trabaho Biñan` : "Jobs in Biñan, Laguna — Trabaho Biñan" },
    {
      name: "description",
      content:
        "Current job vacancies in Biñan, Laguna. Every listing shows where the work is, the pay when disclosed, the closing date and how to apply.",
    },
    { property: "og:title", content: "Jobs in Biñan, Laguna — Trabaho Biñan" },
    { property: "og:type", content: "website" },
  ];
}

const FILTER_LABELS: Record<(typeof FILTER_KEYS)[number], (v: string) => string> = {
  city: (v) => v,
  type: (v) => label(EMPLOYMENT_TYPES, v),
  setup: (v) => label(WORK_SETUPS, v),
  education: (v) => `Education: ${label(EDUCATION_LEVELS, v)}`,
  experience: (v) => `Experience: ${label(EXPERIENCE_LEVELS, v)}`,
  employer: (v) => label(ORGANIZATION_TYPES, v),
};

function ActiveFilters({
  filters,
  searchParams,
}: {
  filters: PublicJobFilters;
  searchParams: URLSearchParams;
}) {
  const active = FILTER_KEYS.filter((k) => filters[k]);
  if (active.length === 0) return null;
  const without = (key: string) => {
    const next = new URLSearchParams(searchParams);
    next.delete(key);
    next.delete("page");
    return `?${next.toString()}`;
  };
  const clearAll = () => {
    const next = new URLSearchParams();
    if (filters.q) next.set("q", filters.q);
    return `?${next.toString()}`;
  };
  return (
    <ul aria-label="Active filters" className="mt-3 flex flex-wrap items-center gap-2">
      {active.map((key) => (
        <li key={key}>
          <Link
            to={without(key)}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-pine/30 bg-pine-tint px-2.5 text-sm font-semibold text-pine-strong no-underline hover:border-pine"
          >
            {FILTER_LABELS[key](String(filters[key]))}
            <X aria-hidden="true" className="size-4" />
            <span className="sr-only">(remove filter)</span>
          </Link>
        </li>
      ))}
      {active.length > 1 ? (
        <li>
          <Link to={clearAll()} className="link inline-flex min-h-9 items-center px-1 text-sm">
            Clear all filters
          </Link>
        </li>
      ) : null}
    </ul>
  );
}

export default function Home({ loaderData }: Route.ComponentProps) {
  const { filters, result, cities } = loaderData;
  const [searchParams] = useSearchParams();
  const navigation = useNavigation();
  const loading = navigation.state === "loading" && navigation.location?.pathname === "/";
  const hasCriteria = !!filters.q || activeFilterCount(filters) > 0;
  const first = (result.page - 1) * 20 + 1;
  const last = first + result.jobs.length - 1;

  return (
    <main id="main">
      <Form method="get" role="search" aria-label="Search jobs">
        <section className="border-b border-line bg-surface">
          <div className="mx-auto max-w-6xl px-4 pt-6 pb-6 sm:px-6 sm:pt-8">
            <h1 className="text-3xl font-bold sm:text-4xl">Find work in Biñan</h1>
            <p className="mt-2 max-w-2xl text-lg text-ink-muted">
              Current vacancies from local employers, each with a closing date and clear steps to
              apply. <span lang="fil">Maghanap ng trabaho sa Biñan at mga kalapit na lugar.</span>
            </p>
            <div className="mt-5 flex max-w-2xl gap-2">
              <div className="relative flex-1">
                <Label htmlFor="q" className="sr-only">
                  Job title, company or skill
                </Label>
                <Search
                  aria-hidden="true"
                  className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-ink-subtle"
                />
                <Input
                  id="q"
                  name="q"
                  type="search"
                  defaultValue={filters.q}
                  placeholder="Job or company"
                  autoComplete="off"
                  enterKeyHint="search"
                  className="h-12 pl-10 text-lg"
                />
              </div>
              <Button type="submit" size="lg">
                Search
              </Button>
            </div>
          </div>
        </section>

        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[16.5rem_minmax(0,1fr)] lg:gap-10">
          <aside aria-label="Filters" className="lg:pt-1">
            <JobFilters filters={filters} cities={cities} />
          </aside>

          <section
            aria-labelledby="results-heading"
            aria-busy={loading}
            className={cn(loading && "opacity-60")}
          >
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
              <div>
                <h2 id="results-heading" className="text-2xl font-bold">
                  {result.total === 1 ? "1 open job" : `${result.total} open jobs`}
                </h2>
                {result.total > 20 ? (
                  <p className="text-sm text-ink-muted">
                    Showing {first}–{last}
                  </p>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                <Label htmlFor="sort" className="text-sm font-normal text-ink-muted">
                  Sort
                </Label>
                <NativeSelect
                  id="sort"
                  name="sort"
                  defaultValue={filters.sort}
                  className="w-44"
                  onChange={(e) => e.currentTarget.form?.requestSubmit()}
                >
                  <NativeSelectOption value="newest">Newest first</NativeSelectOption>
                  <NativeSelectOption value="deadline">Closing soonest</NativeSelectOption>
                </NativeSelect>
                <noscript>
                  <Button type="submit" variant="outline">
                    Sort
                  </Button>
                </noscript>
              </div>
            </div>
            <ActiveFilters filters={filters} searchParams={searchParams} />

            {result.jobs.length > 0 ? (
              <>
                <ul className="mt-4 space-y-3">
                  {result.jobs.map((job) => (
                    <JobListItem key={job.id} job={job} />
                  ))}
                </ul>
                <Pagination
                  page={result.page}
                  pageCount={result.pageCount}
                  searchParams={searchParams}
                />
              </>
            ) : hasCriteria ? (
              <EmptyState
                className="mt-4"
                icon={SearchX}
                title="No jobs match your search"
                actions={
                  <Link to="/" className={buttonVariants({ variant: "outline" })}>
                    Show all open jobs
                  </Link>
                }
              >
                <p>Try a shorter word, check the spelling, or remove a filter.</p>
              </EmptyState>
            ) : (
              <EmptyState className="mt-4" icon={SearchX} title="No open jobs right now">
                <p>
                  New vacancies are added after they are reviewed. Check again soon. Employers who
                  want to list a vacancy can find out how on the{" "}
                  <Link to="/help" className="link">
                    help page
                  </Link>
                  .
                </p>
              </EmptyState>
            )}
          </section>
        </div>
      </Form>
    </main>
  );
}
