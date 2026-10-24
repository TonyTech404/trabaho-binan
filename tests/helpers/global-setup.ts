import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { readFileSync } from "node:fs";
import pg from "pg";

/**
 * Rebuilds the test database from the versioned migrations before the run.
 * Integration tests are skipped when TEST_DATABASE_URL is not set.
 */
export default async function setup() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) return;
  if (/neon\.tech|production/i.test(url)) {
    throw new Error("TEST_DATABASE_URL must point at a disposable local or CI database.");
  }
  const pool = new pg.Pool({ connectionString: url, max: 1 });
  try {
    await pool.query(
      "drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;",
    );
    await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });

    // Exercise the real grant script when a restricted runtime role is available.
    const appRoleUrl = process.env.TEST_APP_ROLE_DATABASE_URL;
    if (appRoleUrl) {
      const role = decodeURIComponent(new URL(appRoleUrl).username);
      if (!/^[a-z_][a-z0-9_]*$/.test(role)) throw new Error("Unexpected role name");
      const script = readFileSync("scripts/sql/grant-app-role.sql", "utf8").replaceAll(
        ':"app_role"',
        `"${role}"`,
      );
      await pool.query(script);
    }
  } finally {
    await pool.end();
  }
}
