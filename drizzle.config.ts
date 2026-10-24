import { defineConfig } from "drizzle-kit";

// Migrations run with the database owner credentials (MIGRATION_DATABASE_URL),
// never with the restricted runtime role used by the Worker through Hyperdrive.
// `drizzle-kit generate` does not need a connection, so an empty URL is allowed.
const url = process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL ?? "";

export default defineConfig({
  dialect: "postgresql",
  schema: "./app/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url },
  strict: true,
  verbose: true,
});
