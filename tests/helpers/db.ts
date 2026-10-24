import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { afterAll, describe } from "vitest";
import type { Database } from "~/db/client.server";
import * as schema from "~/db/schema";

export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

/** `describe` that only runs when a test database is configured. */
export const describeDb = TEST_DATABASE_URL ? describe : describe.skip;

let pool: pg.Pool | undefined;

export function testDb(): Database {
  pool ??= new pg.Pool({ connectionString: TEST_DATABASE_URL, max: 4 });
  return drizzle(pool, { schema }) as unknown as Database;
}

afterAll(async () => {
  await pool?.end();
  pool = undefined;
});
