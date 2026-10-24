import { Link } from "react-router";
import { cn } from "~/lib/utils";

/**
 * Interim mark (a notice with a gold tab), kept until the owner picks one of
 * the concepts in docs/brand/logo-concepts.md.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={cn("size-8 shrink-0", className)}>
      <rect width="32" height="32" rx="7" fill="#1E5F24" />
      <rect x="7" y="7" width="18" height="18" rx="2" fill="#fff" />
      <rect x="7" y="7" width="6" height="18" rx="2" fill="#E8B923" />
      <rect x="11" y="7" width="2" height="18" fill="#E8B923" />
      <rect x="15.5" y="11" width="6.5" height="2" rx="1" fill="#1E5F24" />
      <rect x="15.5" y="15" width="6.5" height="2" rx="1" fill="#1E5F24" />
      <rect x="15.5" y="19" width="4" height="2" rx="1" fill="#1E5F24" />
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
      <span className="text-xl leading-none font-bold tracking-[-0.01em] whitespace-nowrap">
        Trabaho Biñan
        {suffix ? (
          <span className="ml-2 font-sans text-sm font-normal text-ink-muted">{suffix}</span>
        ) : null}
      </span>
    </Link>
  );
}
