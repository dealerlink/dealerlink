import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for Dealerlink verify specs.
 *
 * Each daily spec lives at tests/e2e/verify-day-N.spec.ts. The root
 * commands are:
 *   - `pnpm verify`         — runs every day's spec in order, fail-fast
 *   - `pnpm verify:latest`  — runs only the newest day's spec
 *
 * Requires:
 *   - Postgres seeded (pnpm db:migrate && pnpm db:seed)
 *   - dev server running on PORT (default 3000) OR set START_DEV_SERVER=1
 *     to let Playwright start it.
 *
 * Chromium binary install is a one-time:
 *   pnpm exec playwright install chromium
 */
const PORT = Number(process.env.PORT ?? 3000);
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false, // each day's spec assumes a known seeded state
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 1,
  // Dev-server route compilation on first hit can run 5-10s per dynamic
  // route. A test that chains loginAs → goto → goto can run close to
  // the default 30s on a cold .next. Give it headroom so the suite is
  // not flaky.
  timeout: 60_000,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'pnpm dev',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
