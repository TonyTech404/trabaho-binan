import { data, redirect } from "react-router";
import { getServices } from "~/lib/context.server";
import { getPublicJob, recordJobMetric } from "~/services/public-jobs.server";
import type { Route } from "./+types/apply";

/**
 * Apply links pass through here so that a stale cached page can never send
 * someone to a closed vacancy: the status is checked on every click.
 * The redirect target comes only from the approved listing, never the URL.
 */
export async function loader({ params, request, context }: Route.LoaderArgs) {
  const services = getServices(context);
  const db = await services.db();
  const result = await getPublicJob(db, params.publicId);
  if (!result) throw data("Job not found", { status: 404 });

  const jobPath = `/jobs/${result.job.publicId}/${result.job.slug}`;
  const noStore = { "Cache-Control": "no-store" };
  if (result.state !== "open") throw redirect(jobPath, { headers: noStore });

  const via = new URL(request.url).searchParams.get("via");
  const target =
    via === "email" && result.job.applicationEmail
      ? `mailto:${result.job.applicationEmail}?subject=${encodeURIComponent(`Application: ${result.job.title}`)}`
      : via === "url" && result.job.applicationUrl
        ? result.job.applicationUrl
        : null;
  if (!target) throw redirect(`${jobPath}#how-to-apply`, { headers: noStore });

  services.defer(() => recordJobMetric(db, result.job.id, "applyClicks"));
  throw redirect(target, { headers: { ...noStore, "Referrer-Policy": "no-referrer" } });
}
