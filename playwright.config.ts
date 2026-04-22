import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright configuration for E2E tests.
 *
 * Tests run against the local dev stack:
 *   - Next.js frontend  → http://localhost:3000
 *   - Catalog API       → http://localhost:8001  (via NEXT_PUBLIC_CATALOG_API_URL)
 *
 * The `webServer` block is intentionally omitted: `npm run test:e2e` expects
 * the developer to have the full stack running already (e.g. via docker compose
 * or `npm run dev` + backend services). If the dev server is not up the tests
 * will fail fast with a clear network error.
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
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
