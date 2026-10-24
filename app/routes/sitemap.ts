import { getServices } from "~/lib/context.server";
import { listSitemapJobs } from "~/services/public-jobs.server";
import type { Route } from "./+types/sitemap";

export async function loader({ context }: Route.LoaderArgs) {
  const services = getServices(context);
  const jobs = await listSitemapJobs(await services.db());
  const base = services.baseUrl;
  const urls = [
    `<url><loc>${base}/</loc></url>`,
    `<url><loc>${base}/help</loc></url>`,
    ...jobs.map(
      (j) =>
        `<url><loc>${base}/jobs/${j.publicId}/${j.slug}</loc><lastmod>${j.updatedAt.toISOString()}</lastmod></url>`,
    ),
  ];
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join("")}</urlset>`,
    {
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=0, s-maxage=600",
      },
    },
  );
}
