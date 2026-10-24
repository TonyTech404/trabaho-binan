import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

export const E2E_PASSWORD = "e2e-password-123";

/** Rebuild and seed the disposable E2E database before the run. */
export default async function globalSetup() {
  const url = process.env.E2E_DATABASE_URL;
  const appUrl = process.env.E2E_APP_DATABASE_URL;
  if (!url || !appUrl) throw new Error("Set E2E_DATABASE_URL and E2E_APP_DATABASE_URL.");
  if (/neon\.tech|production/i.test(url))
    throw new Error("E2E_DATABASE_URL must be a disposable database.");

  const pool = new pg.Pool({ connectionString: url, max: 1 });
  try {
    await pool.query(
      "drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;",
    );
    await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
    const role = decodeURIComponent(new URL(appUrl).username);
    if (!/^[a-z_][a-z0-9_]*$/.test(role)) throw new Error("Unexpected role name");
    await pool.query(
      readFileSync("scripts/sql/grant-app-role.sql", "utf8").replaceAll(':"app_role"', `"${role}"`),
    );
  } finally {
    await pool.end();
  }
  execFileSync("npx", ["tsx", "--tsconfig", "tsconfig.cloudflare.json", "scripts/seed.ts"], {
    env: {
      ...process.env,
      DATABASE_URL: url,
      SEED_PASSWORD: E2E_PASSWORD,
      SEED_ENVIRONMENT: "e2e",
    },
    stdio: "inherit",
  });
}
