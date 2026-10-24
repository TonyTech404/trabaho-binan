import { getServices } from "~/lib/context.server";
import { serviceErrorResult } from "~/lib/route-helpers.server";
import { requireViewer } from "~/lib/session.server";
import { openResume } from "~/services/applications.server";
import type { Route } from "./+types/application-resume";

/**
 * Streams a résumé to staff or to members of the job's organization. There is
 * no public URL for résumés; every download is checked and recorded.
 */
export async function loader({ request, params, context }: Route.LoaderArgs) {
  const viewer = await requireViewer(request, context);
  const services = getServices(context);
  const db = await services.db();
  try {
    const file = await openResume(db, services.resumes, viewer, params.applicationId);
    return new Response(file.body, {
      headers: {
        "Content-Type": file.contentType,
        "Content-Length": String(file.size),
        "Content-Disposition": `attachment; filename="${file.filename}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return serviceErrorResult(error);
  }
}
