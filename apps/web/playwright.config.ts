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
 *   - the WORKERS process running too — PDF generation enqueues a pg-boss
 *     `render-pdf` job that the workers process consumes (DEV.63). The
 *     managed webServer below boots both web + workers; if you bring your own
 *     dev server (reuseExistingServer), run `pnpm dev:workers` alongside it or
 *     PDF specs (day 10–13, critical-path) will time out.
 *
 * Chromium binary install is a one-time:
 *   pnpm exec playwright install chromium
 */
const PORT = Number(process.env.PORT ?? 3000);
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${PORT}`;
// When BASE_URL is a remote https host (staging/prod smoke), Playwright must
// NOT spin up a local dev server — it should drive the deployed app directly.
const IS_REMOTE = /^https:\/\//.test(BASE_URL);

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
  // DEV.81 — hard cap on the whole run. On Windows, Playwright cannot reliably
  // tear down the `pnpm --parallel … dev` webServer tree (next + tsx survive
  // the SIGTERM to the pnpm parent), so after the last spec the run can HANG
  // indefinitely in teardown. globalTimeout force-terminates the process so the
  // run always ends; the json reporter below writes results at onEnd (BEFORE
  // teardown), so a teardown-hang force-exit still leaves a complete result
  // file to read. 20 min covers a cold full run incl. flaky retries (a clean
  // pass is ~12-15 min on a cold .next; 15 min was proven too tight once two
  // dev-mode flakies retried — D.3 verify cut its last spec at the cap). The
  // hang, not the tests, is what would blow past 20 min.
  globalTimeout: 1_200_000,
  // Cold dev-server route compilation can take 5-10s on first hit; the
  // default 5s expect timeout is too tight for that. 15s matches the
  // per-step budget the critical-path spec is written against.
  expect: { timeout: 15_000 },
  workers: 1,
  // DEV.81 — always emit a machine-readable result file (written at onEnd,
  // before the flaky Windows webServer teardown) so the pass/fail outcome is
  // recoverable even when the process is force-terminated by globalTimeout.
  // `list` keeps the human-readable stream for interactive runs.
  reporter: process.env.CI
    ? 'github'
    : [['list'], ['json', { outputFile: 'test-results/verify-results.json' }]],
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
  // Only manage a local dev server when targeting localhost. Against a remote
  // https BASE_URL (staging/prod smoke) Playwright drives the deployed app
  // directly. exactOptionalPropertyTypes forbids `webServer: undefined`, so
  // the key is spread in conditionally.
  ...(IS_REMOTE
    ? {}
    : {
        webServer: {
          // Boot web + workers together: PDF specs need the workers process to
          // consume the `render-pdf` queue (DEV.63). Playwright still gates
          // readiness on the web `url`; workers has no HTTP port.
          command: 'pnpm --parallel --filter web --filter workers dev',
          url: BASE_URL,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
          stdout: 'pipe' as const,
          stderr: 'pipe' as const,
        },
      }),
});
