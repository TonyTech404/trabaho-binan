import { DashboardShell, employerNav } from "~/components/dashboard/shell";
import { getServices } from "~/lib/context.server";
import { requireEmployerViewer } from "~/lib/session.server";
import type { Route } from "./+types/layout";

// Every /employer request passes this check; services also scope every query to the viewer's organization.
export const middleware: Route.MiddlewareFunction[] = [
  async ({ request, context }) => {
    await requireEmployerViewer(request, context);
  },
];

export async function loader({ request, context }: Route.LoaderArgs) {
  const viewer = await requireEmployerViewer(request, context);
  return {
    appEnv: getServices(context).env.APP_ENV,
    viewer: { name: viewer.name, role: viewer.role, organizationName: viewer.organizationName },
  };
}

export const meta = () => [{ name: "robots", content: "noindex" }];

export default function EmployerLayout({ loaderData }: Route.ComponentProps) {
  return (
    <DashboardShell
      appEnv={loaderData.appEnv}
      title="Employer dashboard"
      viewer={loaderData.viewer}
      items={employerNav()}
    />
  );
}
