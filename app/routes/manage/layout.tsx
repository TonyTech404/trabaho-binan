import { DashboardShell, staffNav } from "~/components/dashboard/shell";
import { getServices } from "~/lib/context.server";
import { requireStaffViewer } from "~/lib/session.server";
import { getStaffNavCounts } from "~/services/job-queries.server";
import type { Route } from "./+types/layout";

// Every /manage request (documents, data requests and actions) passes this check.
export const middleware: Route.MiddlewareFunction[] = [
  async ({ request, context }) => {
    await requireStaffViewer(request, context);
  },
];

export async function loader({ request, context }: Route.LoaderArgs) {
  const viewer = await requireStaffViewer(request, context);
  const services = getServices(context);
  const counts = await getStaffNavCounts(await services.db());
  return {
    appEnv: services.env.APP_ENV,
    viewer: { name: viewer.name, role: viewer.role as "admin" | "reviewer" },
    counts,
  };
}

export const meta = () => [{ name: "robots", content: "noindex" }];

export default function ManageLayout({ loaderData }: Route.ComponentProps) {
  return (
    <DashboardShell
      appEnv={loaderData.appEnv}
      title="Review dashboard"
      viewer={loaderData.viewer}
      items={staffNav(loaderData.viewer.role, loaderData.counts)}
    />
  );
}
