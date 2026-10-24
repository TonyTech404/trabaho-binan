import { Link } from "react-router";
import sealUrl from "~/assets/logos/city-of-binan-seal.png?url";
import pesoUrl from "~/assets/logos/peso-binan.png?url";
import { cn } from "~/lib/utils";

/**
 * The City of Biñan seal and the PESO logo, used with permission. Shown as
 * supplied: only scaled, never cropped, recoloured or combined into one mark.
 */
export function OfficialLogos({
  className,
  decorative = false,
}: {
  className?: string;
  /** True when nearby text already names the office (for example inside the home link). */
  decorative?: boolean;
}) {
  return (
    <span className={cn("flex shrink-0 items-center gap-1", className)}>
      <img
        src={sealUrl}
        alt={decorative ? "" : "Seal of the City of Biñan"}
        width={168}
        height={168}
        className="h-full w-auto object-contain"
      />
      <img
        src={pesoUrl}
        alt={decorative ? "" : "PESO Biñan logo"}
        width={168}
        height={168}
        className="h-full w-auto object-contain"
      />
    </span>
  );
}

export function Wordmark({ to = "/", suffix }: { to?: string; suffix?: string }) {
  return (
    <Link
      to={to}
      className="inline-flex min-h-11 min-w-0 items-center gap-2 rounded-md text-ink no-underline sm:gap-2.5"
    >
      <OfficialLogos decorative className="h-8 sm:h-10" />
      <span className="flex min-w-0 flex-col">
        <span className="text-lg leading-tight font-bold tracking-[-0.01em] whitespace-nowrap sm:text-xl sm:leading-tight">
          Trabaho Biñan
          {suffix ? (
            <span className="ml-2 hidden text-sm font-normal text-ink-muted sm:inline">
              {suffix}
            </span>
          ) : null}
        </span>
        <span className="text-xs leading-tight text-ink-muted">PESO Biñan</span>
      </span>
    </Link>
  );
}
