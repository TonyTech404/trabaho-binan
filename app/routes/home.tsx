import { getServices } from "~/lib/context.server";
import { publicCacheControl, PUBLIC_LIST_TTL_SECONDS } from "~/lib/public-cache.server";
import { parsePublicFilters, searchPublicJobs } from "~/services/public-jobs.server";
import type { Route } from "./+types/home";

export async function loader({ request, context }: Route.LoaderArgs) {
  const db = await getServices(context).db();
  const filters = parsePublicFilters(new URL(request.url).searchParams);
  return { filters, result: await searchPublicJobs(db, filters) };
}

export function headers() {
  return { "Cache-Control": publicCacheControl(PUBLIC_LIST_TTL_SECONDS) };
}

export default function Home({ loaderData }: Route.ComponentProps) {
  return (
    <main>
      <h1>Trabaho Biñan</h1>
      <p>{loaderData.result.total} open jobs</p>
      <ul>
        {loaderData.result.jobs.map((j) => (
          <li key={j.id}>
            {j.title} — {j.organizationName}
          </li>
        ))}
      </ul>
    </main>
  );
}
