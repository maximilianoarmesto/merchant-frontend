import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright configuration for E2E tests.
 *
 * The `webServer` block starts the Next.js dev server automatically so that
 * `npm run test:e2e` works without needing a manually-started frontend process.
 * The backend catalog/checkout APIs are intercepted via Playwright route mocks
 * inside each test, so no real backend services are required.
 *
 * Environment variables:
 *   PLAYWRIGHT_BASE_URL          override the frontend URL (default: http://localhost:3000)
 *   NEXT_PUBLIC_CATALOG_API_URL  catalog API base (default: http://localhost:8001)
 */
export default defineConfig({
  testDir: "./e2e",
  /* Every test gets its own isolated browser context. */
  fullyParallel: false,
  /* Fail the CI build on any accidental test.only. */
  forbidOnly: !!process.env["CI"],
  /* No retries locally; 1 retry on CI to tolerate flakiness. */
  retries: process.env["CI"] ? 1 : 0,
  /* Single worker keeps test ordering deterministic vs. the real backend. */
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    /* All tests target the Next.js dev server. */
    baseURL: process.env["PLAYWRIGHT_BASE_URL"] ?? "http://localhost:3000",
    /* Capture a trace on first retry so failures are easy to debug. */
    trace: "on-first-retry",
    /* Short action timeout so tests fail fast on DOM issues. */
    actionTimeout: 10_000,
  },

  /* Start the Next.js dev server automatically before the test run.
   * NODE_ENV is forced to "development" so that Next.js can parse CSS modules
   * correctly even when the parent shell has NODE_ENV set to "test" (e.g.
   * after a Jest run in the same terminal session). */
  webServer: {
    command: "NODE_ENV=development npm run dev",
    url: process.env["PLAYWRIGHT_BASE_URL"] ?? "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120_000,
    stdout: "ignore",
    stderr: "pipe",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
