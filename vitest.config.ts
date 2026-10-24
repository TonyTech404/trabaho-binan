import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

// TEST_DATABASE_URL (and optional TEST_APP_ROLE_DATABASE_URL) come from .env
// locally and from real environment variables in CI. Global setup needs them too.
for (const [key, value] of Object.entries(loadEnv("test", process.cwd(), "TEST_"))) {
  process.env[key] ??= value;
}

export default defineConfig({
  resolve: {
    alias: { "~": fileURLToPath(new URL("./app", import.meta.url)) },
  },
  test: {
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    environment: "node",
    globalSetup: ["tests/helpers/global-setup.ts"],
    // Integration tests share one database; run files one at a time.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 60_000,
  },
});
