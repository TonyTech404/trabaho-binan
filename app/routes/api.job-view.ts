import { isbot } from "isbot";
import { getServices } from "~/lib/context.server";
import { withinRateLimit } from "~/lib/rate-limit.server";
import { getPublicJob, recordJobMetric } from "~/services/public-jobs.server";
import type { Route } from "./+types/api.job-view";

/** Beacon target for job-page views. Aggregated per day; nothing about the visitor is stored. */
export async function action({ params, request, context }: Route.ActionArgs) {
  const services = getServices(context);
  const ua = request.headers.get("user-agent");
  if (ua && isbot(ua)) return new Response(null, { status: 204 });
  if (!(await withinRateLimit(services.env.FORM_LIMITER, request, "view"))) {
    return new Response(null, { status: 204 });
  }
  const db = await services.db();
  const result = await getPublicJob(db, params.publicId);
  if (result?.state === "open") {
    services.defer(() => recordJobMetric(db, result.job.id, "views"));
  }
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
