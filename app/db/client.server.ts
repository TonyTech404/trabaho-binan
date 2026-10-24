import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Client } from "pg";
import * as schema from "./schema";

export type Database = NodePgDatabase<typeof schema>;

/**
 * Opens one PostgreSQL connection for the lifetime of a request.
 *
 * Hyperdrive pools connections to Neon, so Cloudflare recommends a new
 * `pg.Client` per request rather than a long-lived pool inside the Worker.
 * The connection is opened lazily: public pages that never touch the
 * database (or are served from cache) do not pay for it.
 */
export function createLazyDatabase(connectionString: string) {
  let client: Client | undefined;
  let pending: Promise<Database> | undefined;

  return {
    get(): Promise<Database> {
      pending ??= (async () => {
        client = new Client({ connectionString });
        await client.connect();
        return drizzle(client, { schema });
      })();
      return pending;
    },
    async close() {
      if (client) {
        const c = client;
        client = undefined;
        pending = undefined;
        await c.end().catch(() => {});
      }
    },
  };
}

export type LazyDatabase = ReturnType<typeof createLazyDatabase>;
