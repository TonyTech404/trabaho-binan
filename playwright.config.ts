import { defineConfig, devices } from "@playwright/test";
import { loadEnv } from "vite";

// E2E_DATABASE_URL (owner, for reset/seed) and E2E_APP_DATABASE_URL (runtime role)
// come from .env locally and from real environment variables in CI.
for (const [key, value] of Object.entries(loadEnv("test", process.cwd(), "E2E_"))) {
  process.env[key] ??= value;
}

const PORT = 4173;
export const BASE_URL = `http://localhost:${PORT}`;

/**
 * End-to-end tests run against the production build served by `vite preview`
 * (the Workers runtime, with CSP and edge caching active) and a disposable
 * database seeded with synthetic data.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  globalSetup: "./tests/e2e/global-setup.ts",
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    { name: "chromium", use: { ...devices["Desktop Chrome"] }, dependencies: ["setup"] },
    {
      name: "mobile",
      use: { ...devices["Pixel 7"] },
      dependencies: ["setup"],
      testMatch: /public\.spec\.ts/,
    },
  ],
  webServer: {
    command: `npm run build && npx vite preview --port ${PORT} --strictPort`,
    url: `${BASE_URL}/healthz`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE:
        process.env.E2E_APP_DATABASE_URL ?? "",
    },
  },
});
