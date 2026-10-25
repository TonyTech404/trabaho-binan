import { getServices } from "~/lib/context.server";
import { serviceErrorResult } from "~/lib/route-helpers.server";
import { requireViewer } from "~/lib/session.server";
import { openApplicationFile } from "~/services/applications.server";
import type { Route } from "./+types/application-file";

/**
 * Streams one attached file to staff or to members of the job's
 * organization. There is no public URL for these files; every access is
 * checked and recorded. `?view=1` shows photos and PDFs in the browser.
 */
export async function loader({ request, params, context }: Route.LoaderArgs) {
  const viewer = await requireViewer(request, context);
  const services = getServices(context);
  const db = await services.db();
  const inline = new URL(request.url).searchParams.get("view") === "1";
  try {
    const file = await openApplicationFile(
      db,
      services.resumes,
      viewer,
      params.applicationId,
      params.fileId,
    );
    const viewable =
      file.contentType.startsWith("image/") || file.contentType === "application/pdf";
    return new Response(file.body, {
      headers: {
        "Content-Type": file.contentType,
        "Content-Length": String(file.size),
        "Content-Disposition": `${inline && viewable ? "inline" : "attachment"}; filename="${file.filename}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        // A PDF viewed inline must not run anything or reach other origins.
        "Content-Security-Policy":
          "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
      },
    });
  } catch (error) {
    return serviceErrorResult(error);
  }
}
