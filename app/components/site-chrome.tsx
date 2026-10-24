import { CircleHelp, LayoutDashboard, LogIn } from "lucide-react";
import { Form, Link, NavLink } from "react-router";
import { cn } from "~/lib/utils";
import { Wordmark } from "./wordmark";

export interface ShellViewer {
  name: string;
  role: "admin" | "reviewer" | "employer";
}

/** Shown on every page outside production so sample data is never mistaken for real vacancies. */
export function EnvironmentBanner({ appEnv }: { appEnv: string }) {
  if (appEnv === "production") return null;
  return (
    <div className="bg-marigold px-4 py-1.5 text-center text-sm font-semibold text-ink">
      {appEnv === "staging" ? "Staging site" : "Development site"}: sample listings only. These are
      not real vacancies.
    </div>
  );
}

export function SkipLink() {
  return (
    <a
      href="#main"
      className="sr-only z-50 rounded-md bg-surface px-4 py-3 font-semibold text-ink focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
    >
      Skip to main content
    </a>
  );
}

const navLink = ({ isActive }: { isActive: boolean }) =>
  cn(
    "inline-flex min-h-11 items-center gap-1.5 rounded-md px-2 text-[0.9375rem] font-semibold whitespace-nowrap text-ink no-underline hover:bg-muted sm:px-3",
    isActive && "text-lake",
  );

export function SiteHeader({ viewer }: { viewer: ShellViewer | null }) {
  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-4 py-1.5 sm:px-6">
        <Wordmark />
        <nav aria-label="Site" className="flex items-center">
          <NavLink to="/help" className={navLink}>
            <CircleHelp aria-hidden="true" className="hidden size-4.5 min-[400px]:block" />
            Help
          </NavLink>
          {viewer ? (
            <NavLink to={viewer.role === "employer" ? "/employer" : "/manage"} className={navLink}>
              <LayoutDashboard aria-hidden="true" className="hidden size-4.5 min-[400px]:block" />
              Dashboard
            </NavLink>
          ) : (
            <NavLink to="/login" className={navLink}>
              <LogIn aria-hidden="true" className="hidden size-4.5 min-[400px]:block" />
              <span>
                Sign in<span className="sr-only"> for employers and staff</span>
              </span>
            </NavLink>
          )}
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-line bg-surface">
      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-8 text-sm text-ink-muted sm:grid-cols-[1fr_auto] sm:px-6">
        <div className="max-w-xl space-y-2">
          <p className="font-heading text-lg font-bold text-ink">Trabaho Biñan</p>
          <p>
            A pro bono community job board for Biñan, Laguna. Listings are reviewed before they are
            published. Trabaho Biñan is not an official website of the City Government of Biñan or
            of PESO Biñan.
          </p>
          <p>Never pay to apply for a job. Report any listing that asks for fees.</p>
        </div>
        <nav aria-label="Footer" className="flex flex-col gap-1 sm:items-end">
          <Link className="link min-h-9 content-center" to="/">
            Browse jobs
          </Link>
          <Link className="link min-h-9 content-center" to="/help">
            Help and safety tips
          </Link>
          <Link className="link min-h-9 content-center" to="/privacy">
            Privacy
          </Link>
          <Link className="link min-h-9 content-center" to="/login">
            Employer and staff sign-in
          </Link>
        </nav>
      </div>
    </footer>
  );
}

export function SignOutButton({ className }: { className?: string }) {
  return (
    <Form method="post" action="/logout" className={className}>
      <button
        type="submit"
        className="inline-flex min-h-11 items-center rounded-md px-3 text-[0.9375rem] font-semibold text-ink hover:bg-muted"
      >
        Sign out
      </button>
    </Form>
  );
}
