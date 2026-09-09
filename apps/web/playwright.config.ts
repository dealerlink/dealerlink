import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { defineConfig, devices } from '@playwright/test';

/**
 * On an arm64 devcontainer the workers process's `@sparticuz/chromium` is an
 * x86-64 binary that cannot launch (DEV.89), so the PDF verify specs would
 * fail. Point the workers process (booted by the webServer below) at the
 * arm64 Chromium that Playwright installs. No-op on x64 / when already set.
 */
function findPlaywrightChromium(): string | undefined {
  if (process.env.PUPPETEER_EXECUTABLE_PATH || process.arch === 'x64') return undefined;
  const base = path.join(os.homedir(), '.cache', 'ms-playwright');
  if (!fs.existsSync(base)) return undefined;
  for (const dir of fs.readdirSync(base)) {
    if (!dir.startsWith('chromium-') || dir.includes('headless')) continue;
    const exe = path.join(base, dir, 'chrome-linux', 'chrome');
    if (fs.existsSync(exe)) return exe;
  }
  return undefined;
}

const puppeteerExecutable = findPlaywrightChromium();

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
  // DEV.81 / DEV.101 — hard cap on the whole run, sized to kill a HANG, not to
  // bound suite runtime. On Windows, Playwright cannot reliably tear down the
  // `pnpm --parallel … dev` webServer tree (next + tsx survive the SIGTERM to
  // the pnpm parent), so after the last spec the run can HANG indefinitely in
  // teardown. globalTimeout force-terminates the process so the run always
  // ends; the json reporter below writes results at onEnd (BEFORE teardown),
  // so a teardown-hang force-exit still leaves a complete result file to read.
  //
  // Raised 20 min -> 40 min on Day 23 (DEV.101), deliberately and on its own
  // merits — NOT as a workaround for the flakes, which are F.52's problem.
  // At 20 min the cap had stopped doing its job and started doing a different
  // one: CI run 34223278188 went RED with `"unexpected": 0` — zero tests
  // failed. Two known flakes retried, cost 75.5s, and the suite's own test
  // time was 19.0 min of the 20.0 min budget, so the cap fired mid-spec and
  // two tests never ran. Green runs were sitting at 16m25s-19m10s, and `main`
  // itself passed at 18.2 min WITH two flakies: two retries could redden any
  // branch. A gate that reddens when nothing broke trains people to re-run
  // reflexively, which is how the run that matters gets missed.
  //
  // DEV.104 / F.52 — 40 min -> 25 min, to resolve an ORDERING BUG, not to
  // bound runtime. At 40 min this cap sat ABOVE the 30-minute
  // `timeout-minutes` on the e2e job, so on a genuine CI hang GitHub killed
  // the job first and Playwright's onEnd never ran — meaning
  // test-results/verify-results.json, the artifact DEV.81 exists to preserve,
  // was missing in exactly the case it was written for. The two limits must be
  // strictly ordered, and Playwright's must fire first.
  //
  // The pair is now: globalTimeout 25 min < e2e timeout-minutes 40 min. The 15
  // minutes between them is not slack for the suite — it is the room the JOB
  // needs after the cap fires: ~1 min of pre-verify setup (install, browser
  // install, migrate, seed), plus the failure-path artifact uploads that only
  // run once Playwright has exited.
  //
  // Why 25 and not 20: DEV.101 is the cautionary tale. A 20 min cap against a
  // 19.0 min suite fired mid-run and reddened a branch on which NO test failed
  // (`"unexpected": 0`). A cap must never be close enough to real runtime to
  // do that. 25 min sits ~50% above the measured runtime and ~65% above the
  // 15-minute target, and only a hang reaches it.
  globalTimeout: 1_500_000,
  // F.52 — the route warm-up pass. Requests every route the suite will visit
  // once, concurrently, BEFORE the first test, so `next dev`'s first-hit
  // compilation (8-16s per route on CI) is paid off the test clock instead of
  // by whichever spec happens to touch the route first. See
  // tests/e2e/global-setup.ts for the full rationale and the safety argument.
  //
  // Only meaningful against a local dev server. A remote staging/prod smoke
  // target is already built, and the seeded credentials the warm-up signs in
  // with do not exist there.
  ...(IS_REMOTE ? {} : { globalSetup: './tests/e2e/global-setup.ts' }),
  // Cold dev-server route compilation can take 5-10s on first hit; the
  // default 5s expect timeout is too tight for that. 15s matches the
  // per-step budget the critical-path spec is written against.
  expect: { timeout: 15_000 },
  // Always 1 — local AND CI. Not just a devcontainer memory guard (DEV.87):
  // fullyParallel is false and every day-spec asserts against a shared, known
  // seeded state, so two workers would race the same rows. Serial execution is
  // a correctness requirement here, not only a resource one, so there is no CI
  // parallelism to preserve.
  workers: 1,
  // DEV.81 — always emit a machine-readable result file (written at onEnd,
  // before the flaky Windows webServer teardown) so the pass/fail outcome is
  // recoverable even when the process is force-terminated by globalTimeout.
  // `list` keeps the human-readable stream for interactive runs.
  // CI adds an HTML report on top of the GitHub annotations so a failure can
  // be diagnosed from the uploaded artifact rather than by re-reading raw log
  // output (.github/workflows/verify.yml uploads both on failure). `github`
  // alone writes no files.
  reporter: process.env.CI
    ? [
        ['github'],
        ['html', { open: 'never', outputFolder: 'playwright-report' }],
        ['json', { outputFile: 'test-results/verify-results.json' }],
      ]
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
          env: {
            // The verify server is http://localhost — auth cookies must not be
            // Secure or the browser drops the session and every spec fails at
            // login (DEV.87). This is the explicit, dev-only opt-out; the
            // fail-safe default stays secure. Set here (not just in .env.local)
            // so verify is reproducible from a clean checkout.
            SESSION_COOKIE_SECURE: 'false',
            // DEV.106 — raise the dev server's heap ceiling so it does not
            // RESTART ITSELF in the middle of the run.
            //
            // Node's default limit here is ~2 GB. Compiling the ~40 routes
            // this suite visits takes `next dev` past its comfort threshold,
            // at which point Next prints
            //
            //     ⚠ Server is approaching the used memory threshold, restarting...
            //
            // and restarts. Whatever request is in flight dies with
            // ERR_CONNECTION_REFUSED, which is how this surfaces: a spec fails
            // on a connection error rather than on anything it asserted.
            //
            // THIS IS A LOCAL-ONLY FAILURE MODE. Do not read it as the cause of
            // the CI flakes. All four CI runs examined on Day 24 (34375881563,
            // 34309474851, 34327213279, 34223278188) contain ZERO restart
            // markers — one `▲ Next.js`, one `Ready in`, one
            // `Compiling /instrumentation` each, i.e. a single dev-server
            // lifetime per run. On CI the repeated compilation is
            // on-demand-entries EVICTION instead, which is what the
            // `onDemandEntries` block in next.config.mjs addresses. The two
            // mechanisms look alike in a log and are not the same thing.
            //
            // This is a ceiling, not an allocation: the process still uses what
            // it uses. Sized against the container, which has ~11.9 GB total
            // (`memory.max` is unset, MemTotal 12232784 kB), shared with the
            // workers process, Chromium and the Playwright runner. Not raised
            // further, because DEV.87/91's OOM is what put `workers: 1` in this
            // file and that lesson stands.
            NODE_OPTIONS: '--max-old-space-size=6144',
            // arm64 devcontainer: give the workers process a runnable Chromium
            // for the PDF specs (DEV.89). Undefined on x64 → spread drops it.
            ...(puppeteerExecutable ? { PUPPETEER_EXECUTABLE_PATH: puppeteerExecutable } : {}),
          },
        },
      }),
});
