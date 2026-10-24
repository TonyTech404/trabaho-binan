import { getServices } from "~/lib/context.server";
import { requireStaffViewer } from "~/lib/session.server";
import { manilaDateString } from "~/lib/time";
import { recordAudit } from "~/services/common.server";
import { exportJobs } from "~/services/job-queries.server";
import type { Route } from "./+types/export";

/** Neutralise spreadsheet formulas (CSV injection) and quote every cell. */
function csvCell(value: unknown): string {
  if (value == null) return "";
  let s = value instanceof Date ? value.toISOString() : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const viewer = await requireStaffViewer(request, context);
  const db = await getServices(context).db();
  const rows = await exportJobs(db, viewer);
  const columns = rows.length ? Object.keys(rows[0]) : ["publicId"];
  const lines = [
    columns.join(","),
    ...rows.map((r) => columns.map((c) => csvCell((r as Record<string, unknown>)[c])).join(",")),
  ];
  await recordAudit(db, viewer, {
    action: "jobs.export",
    entityType: "job",
    summary: `Exported ${rows.length} listings as CSV`,
  });
  // The byte-order mark helps spreadsheet apps detect UTF-8 (ñ, ₱).
  return new Response(`\uFEFF${lines.join("\r\n")}\r\n`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="trabaho-binan-jobs-${manilaDateString()}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
