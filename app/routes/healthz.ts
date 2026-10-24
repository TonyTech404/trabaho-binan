import { sql } from "drizzle-orm";
import { getServices } from "~/lib/context.server";
import type { Route } from "./+types/healthz";

/** Liveness and database connectivity check. Reveals no configuration details. */
export async function loader({ context }: Route.LoaderArgs) {
  const services = getServices(context);
  const started = Date.now();
  try {
    const db = await services.db();
    await db.execute(sql`select 1`);
    return Response.json(
      { ok: true, database: "ok", latencyMs: Date.now() - started },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { ok: false, database: "unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
