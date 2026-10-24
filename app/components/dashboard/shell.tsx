import {
  Building2,
  ClipboardCheck,
  FileClock,
  Flag,
  LayoutDashboard,
  ListChecks,
  ScrollText,
  Settings,
  UserRound,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { NavLink, Outlet } from "react-router";
import { NavigationProgress } from "~/components/navigation-progress";
import { EnvironmentBanner, SignOutButton, SkipLink } from "~/components/site-chrome";
import { Wordmark } from "~/components/wordmark";
import { ROLES } from "~/lib/labels";
import { cn } from "~/lib/utils";

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
  count?: number;
}

export function staffNav(
  role: "admin" | "reviewer",
  counts: { review: number; reports: number },
): NavItem[] {
  const items: NavItem[] = [
    { to: "/manage", label: "Overview", icon: LayoutDashboard, end: true },
    { to: "/manage/review", label: "Review queue", icon: ClipboardCheck, count: counts.review },
    { to: "/manage/jobs", label: "All jobs", icon: ListChecks },
    { to: "/manage/employers", label: "Employers", icon: Building2 },
    { to: "/manage/reports", label: "Reports", icon: Flag, count: counts.reports },
  ];
  if (role === "admin") {
    items.push(
      { to: "/manage/users", label: "Users and access", icon: UsersRound },
      { to: "/manage/audit", label: "Audit history", icon: ScrollText },
      { to: "/manage/settings", label: "Settings", icon: Settings },
    );
  }
  items.push({ to: "/account", label: "Your account", icon: UserRound });
  return items;
}

export function employerNav(): NavItem[] {
  return [
    { to: "/employer", label: "Your jobs", icon: FileClock, end: true },
    { to: "/employer/profile", label: "Company profile", icon: Building2 },
    { to: "/account", label: "Your account", icon: UserRound },
  ];
}

function NavItems({ items, variant }: { items: NavItem[]; variant: "side" | "tabs" }) {
  return (
    <ul className={cn(variant === "side" ? "space-y-0.5" : "flex gap-1")}>
      {items.map((item) => (
        <li key={item.to} className={variant === "tabs" ? "shrink-0" : undefined}>
          <NavLink
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              cn(
                "flex min-h-11 items-center gap-2.5 rounded-md px-3 font-semibold whitespace-nowrap text-ink no-underline hover:bg-muted",
                variant === "tabs" && "text-[0.9375rem]",
                isActive && "bg-lake-tint text-lake-strong hover:bg-lake-tint",
              )
            }
          >
            <item.icon aria-hidden="true" className="size-4.5 shrink-0" />
            <span className="flex-1">{item.label}</span>
            {item.count ? (
              <span className="rounded-sm bg-marigold px-1.5 text-xs leading-5 font-bold text-ink">
                {item.count}
                <span className="sr-only"> waiting</span>
              </span>
            ) : null}
          </NavLink>
        </li>
      ))}
    </ul>
  );
}

export function DashboardShell({
  appEnv,
  title,
  viewer,
  items,
  children,
}: {
  appEnv: string;
  title: string;
  viewer: {
    name: string;
    role: "admin" | "reviewer" | "employer";
    organizationName?: string | null;
  };
  items: NavItem[];
  children?: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh">
      <SkipLink />
      <NavigationProgress />
      <EnvironmentBanner appEnv={appEnv} />
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-1.5 sm:px-6">
          <div className="flex items-center gap-3">
            <Wordmark to="/" />
            <span className="hidden text-ink-muted sm:inline">{title}</span>
          </div>
          <div className="flex items-center gap-2">
            <p className="hidden text-right text-sm leading-tight md:block">
              <span className="block font-semibold">{viewer.name}</span>
              <span className="text-ink-muted">
                {viewer.organizationName ?? ROLES[viewer.role]}
              </span>
            </p>
            <SignOutButton />
          </div>
        </div>
        <nav
          aria-label="Dashboard"
          className="overflow-x-auto border-t border-line px-2 py-1 lg:hidden"
        >
          <NavItems items={items} variant="tabs" />
        </nav>
      </header>
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-6 sm:px-6 lg:grid-cols-[14rem_minmax(0,1fr)]">
        <nav aria-label="Dashboard" className="hidden lg:block">
          <div className="sticky top-4">
            <NavItems items={items} variant="side" />
          </div>
        </nav>
        <main id="main" className="min-w-0">
          {children ?? <Outlet />}
        </main>
      </div>
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  back,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  back?: React.ReactNode;
}) {
  return (
    <div className="mb-6 space-y-2">
      {back}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h1 className="text-3xl font-bold [overflow-wrap:anywhere]">{title}</h1>
          {description ? <div className="max-w-2xl text-ink-muted">{description}</div> : null}
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}
