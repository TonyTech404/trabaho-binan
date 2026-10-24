import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "~/db/schema";
import type { Database } from "~/db/client.server";

/** Connect a maintenance script to the database given by the named env var. */
export function connect(envVar = "DATABASE_URL") {
  const url = process.env[envVar];
  if (!url) {
    console.error(`Set ${envVar} to the target database connection string.`);
    process.exit(1);
  }
  const pool = new pg.Pool({ connectionString: url, max: 2 });
  const db = drizzle(pool, { schema }) as unknown as Database;
  return { db, pool, host: new URL(url).hostname };
}

/** Environment marker stored in the database so scripts can refuse to seed production. */
export async function getEnvironmentMarker(db: Database): Promise<string | null> {
  const [row] = await db
    .select({ value: schema.settings.value })
    .from(schema.settings)
    .where(eq(schema.settings.key, "environment"))
    .limit(1);
  return typeof row?.value === "string" ? row.value : null;
}

export function argValue(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return undefined;
  return process.argv[i + 1];
}
