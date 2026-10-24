import { ChevronLeft, ChevronRight } from "lucide-react";
import { Link } from "react-router";
import { buttonVariants } from "~/components/ui/button";

export function pageHref(searchParams: URLSearchParams, page: number) {
  const next = new URLSearchParams(searchParams);
  if (page <= 1) next.delete("page");
  else next.set("page", String(page));
  const qs = next.toString();
  return qs ? `?${qs}` : "?";
}

export function Pagination({
  page,
  pageCount,
  searchParams,
}: {
  page: number;
  pageCount: number;
  searchParams: URLSearchParams;
}) {
  if (pageCount <= 1) return null;
  return (
    <nav aria-label="Pages" className="mt-6 flex items-center justify-between gap-3">
      {page > 1 ? (
        <Link
          to={pageHref(searchParams, page - 1)}
          className={buttonVariants({ variant: "outline" })}
          rel="prev"
        >
          <ChevronLeft aria-hidden="true" />
          Previous
        </Link>
      ) : (
        <span />
      )}
      <p className="text-sm text-ink-muted">
        Page {page} of {pageCount}
      </p>
      {page < pageCount ? (
        <Link
          to={pageHref(searchParams, page + 1)}
          className={buttonVariants({ variant: "outline" })}
          rel="next"
        >
          Next
          <ChevronRight aria-hidden="true" />
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
