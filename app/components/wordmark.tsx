import { Link } from "react-router";
import { cn } from "~/lib/utils";

/** The mark echoes the listing's closing-date stub: a notice with a marigold tab. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={cn("size-8 shrink-0", className)}>
      <rect width="32" height="32" rx="7" fill="#0F5E6E" />
      <rect x="7" y="7" width="18" height="18" rx="2" fill="#fff" />
      <rect x="7" y="7" width="6" height="18" rx="2" fill="#F2B705" />
      <rect x="11" y="7" width="2" height="18" fill="#F2B705" />
      <rect x="15.5" y="11" width="6.5" height="2" rx="1" fill="#0F5E6E" />
      <rect x="15.5" y="15" width="6.5" height="2" rx="1" fill="#0F5E6E" />
      <rect x="15.5" y="19" width="4" height="2" rx="1" fill="#0F5E6E" />
    </svg>
  );
}

export function Wordmark({ to = "/", suffix }: { to?: string; suffix?: string }) {
  return (
    <Link
      to={to}
      className="inline-flex min-h-11 items-center gap-2.5 rounded-md text-ink no-underline"
    >
      <LogoMark />
      <span className="font-heading text-xl leading-none font-bold tracking-tight whitespace-nowrap">
        Trabaho Biñan
        {suffix ? (
          <span className="ml-2 font-sans text-sm font-normal text-ink-muted">{suffix}</span>
        ) : null}
      </span>
    </Link>
  );
}
