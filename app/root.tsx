import { CircleAlert, Lock, SearchX } from "lucide-react";
import {
  isRouteErrorResponse,
  Link,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useRouteLoaderData,
  type ShouldRevalidateFunctionArgs,
} from "react-router";
import { EnvironmentBanner, SiteFooter, SiteHeader, SkipLink } from "~/components/site-chrome";
import { buttonVariants } from "~/components/ui/button";
import { getServices } from "~/lib/context.server";
import { getViewer } from "~/lib/session.server";
import type { Route } from "./+types/root";
import "./app.css";

export async function loader({ request, context }: Route.LoaderArgs) {
  const viewer = await getViewer(request, context);
  return {
    appEnv: getServices(context).env.APP_ENV,
    viewer: viewer ? { name: viewer.name, role: viewer.role } : null,
  };
}

/** The viewer only changes through sign-in/out (form posts), so skip re-fetching on GET navigation. */
export function shouldRevalidate({
  formMethod,
  defaultShouldRevalidate,
}: ShouldRevalidateFunctionArgs) {
  return formMethod ? defaultShouldRevalidate : false;
}

export const links: Route.LinksFunction = () => [
  { rel: "icon", href: "/favicon-32.png", type: "image/png", sizes: "32x32" },
  { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
];

export function meta() {
  return [
    { title: "Trabaho Biñan — Local jobs in Biñan, Laguna" },
    {
      name: "description",
      content:
        "Find current job vacancies in Biñan, Laguna, with clear deadlines and application instructions. The job portal of PESO Biñan.",
    },
  ];
}

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#1e5f24" />
        <Meta />
        <Links />
      </head>
      <body className="min-h-dvh">
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function useRootData() {
  return useRouteLoaderData<typeof loader>("root");
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const root = useRootData();
  let icon = <CircleAlert aria-hidden="true" className="size-8 text-danger" />;
  let title = "Something went wrong";
  let message =
    "The page could not be loaded. Try again in a moment. If it keeps happening, let the site team know.";
  let status = 500;

  if (isRouteErrorResponse(error)) {
    status = error.status;
    if (error.status === 404) {
      icon = <SearchX aria-hidden="true" className="size-8 text-ink-muted" />;
      title = "Page not found";
      message =
        "This page does not exist or is no longer available. The job may have been removed, or the link may be incomplete.";
    } else if (error.status === 403) {
      icon = <Lock aria-hidden="true" className="size-8 text-ink-muted" />;
      title = "You don't have access to this page";
      message =
        typeof error.data === "string" && error.data
          ? error.data
          : "Your account does not have permission to view this page.";
    } else if (error.status === 429) {
      title = "Too many requests";
      message = "Wait a minute, then try again.";
    }
  } else if (import.meta.env.DEV && error instanceof Error) {
    message = error.message;
  }

  return (
    <>
      <SkipLink />
      <EnvironmentBanner appEnv={root?.appEnv ?? "production"} />
      <SiteHeader viewer={root?.viewer ?? null} />
      <main id="main" className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
        {icon}
        <h1 className="mt-4 text-3xl font-bold">{title}</h1>
        <p className="mt-3 text-lg text-ink-muted">{message}</p>
        <p className="mt-1 text-sm text-ink-subtle">Error {status}</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link to="/" className={buttonVariants()}>
            Browse open jobs
          </Link>
          {status === 403 && !root?.viewer ? (
            <Link to="/login" className={buttonVariants({ variant: "outline" })}>
              Sign in
            </Link>
          ) : null}
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
