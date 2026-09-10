/**
 * Playwright globalSetup — the e2e route warm-up pass (F.52).
 *
 * WHY THIS EXISTS
 *
 * The verify suite runs against `next dev`, where the FIRST request to a route
 * compiles it. CI run 34375881563 (green, `main`) was still paying cold
 * compiles fifteen minutes into the run, with the restored `.next/cache`
 * hitting on its primary key:
 *
 *     ✓ Compiled /                    in 16.2s (3374 modules)
 *     ✓ Compiled /dealers/new         in 11.2s → GET 200 in 11638ms
 *     ✓ Compiled /dealers             in  8.5s
 *     ✓ Compiled /dealers/[id]        in  8.5s
 *     ✓ Compiled /reports/gst-summary in 11.2s → GET 200 in 11683ms
 *
 * That compile time is charged to whichever test happens to touch the route
 * first. An 11.7s GET inside a 15s `expect` budget leaves 3.3s of headroom, so
 * the spec that draws the short straw fails on a navigation or visibility
 * timeout while nothing is actually broken — the DEV.93 / DEV.101 signature,
 * and the whole of the known-flaky six.
 *
 * The fix is to make the first hit happen HERE, before the clock starts: every
 * route the suite will visit is requested once, concurrently, off the test
 * budget. Concurrency also compresses what was serial compilation into the
 * runner's spare cores.
 *
 * WHY IT IS NOT ENOUGH ON ITS OWN — read this before deleting or extending it
 *
 * Warming every route once buys nothing if the dev server then throws the
 * results away, and by default it does. `next dev` keeps a small buffer of
 * compiled route entries (`pagesBufferLength: 5`, `maxInactiveAge: 60s`) and
 * evicts the rest, while this suite visits ~40 routes over 16-19 minutes.
 * Measured with this warm-up in place but WITHOUT the `onDemandEntries` block
 * in next.config.mjs, one local run still recompiled `/login` 5x,
 * `/dashboard` 5x and `/dealers/[id]` 4x, and the suite got SLOWER — 18.8 min
 * without the warm-up, 21.3 min with it, because the warm-up's own ~2.6 min was
 * paid and then discarded.
 *
 * So this file and the `onDemandEntries` block are one change in two places.
 * Neither is worth much alone. If a future session removes the eviction
 * settings, this warm-up becomes dead weight and should go with them.
 *
 * WHAT THIS IS NOT
 *
 * It is not a wait, a retry, or a raised timeout. It changes no spec, weakens
 * no assertion, and adds no tolerance anywhere. If it were deleted the suite
 * would still assert exactly what it asserts today — it would just pay the
 * compile cost inside the tests again.
 *
 * SAFETY
 *
 * GET only. Dynamic segments are warmed with a nil-ish UUID that matches no
 * row, so those routes compile and then render their own not-found path — no
 * INSERT, no UPDATE, no seeded row touched, nothing for a later spec to trip
 * over. A non-2xx is expected and ignored: a 404 or a redirect still means the
 * route compiled, which is the only thing being bought here. Warm-up failure
 * is logged and never fails the run — this must not become a new way for the
 * suite to go red.
 */
import { chromium, request, type BrowserContext, type FullConfig } from '@playwright/test';

import { SEEDED_USERS } from './helpers';

/**
 * A uuid that is syntactically valid (so a `::uuid` cast or a Zod check passes
 * and the route reaches its real query) but matches no seeded row. Every
 * `[id]` route therefore compiles and then renders not-found.
 */
const NO_SUCH_ID = '00000000-0000-4000-8000-000000000000';

/** Routes reachable without a session. */
const PUBLIC_ROUTES = ['/login', '/login?tenant=demo', '/api/health'];

/**
 * Routes inside the tenant app shell, warmed with a signed-in tenant admin.
 * Static list on purpose: a list derived from the specs would drift silently
 * the first time a spec learned a new route.
 */
const TENANT_ROUTES = [
  // The root route. CI run 34375881563 compiled `/` in 16.2s — the single
  // most expensive first hit in that run.
  '/',
  '/dashboard',
  '/change-password',
  '/pipeline',
  '/pipeline/new',
  `/pipeline/${NO_SUCH_ID}`,
  '/dealers',
  '/dealers/new',
  `/dealers/${NO_SUCH_ID}`,
  '/catalog',
  '/catalog?view=table',
  '/catalog/new',
  `/catalog/${NO_SUCH_ID}`,
  '/inventory',
  '/inventory/procurements',
  '/inventory/procurements/new',
  `/inventory/procurements/${NO_SUCH_ID}`,
  `/inventory/procurements/${NO_SUCH_ID}/serials`,
  '/quotations',
  '/quotations/new',
  `/quotations/${NO_SUCH_ID}`,
  `/quotations/${NO_SUCH_ID}/convert-to-pi`,
  '/pi',
  `/pi/${NO_SUCH_ID}`,
  '/orders',
  `/orders/${NO_SUCH_ID}`,
  '/payments',
  '/payments/new',
  '/payments?status=pending_verification',
  `/payments/${NO_SUCH_ID}`,
  '/dispatch',
  '/dispatch?status=in_transit',
  '/dispatch/new',
  `/dispatch/new?order=${NO_SUCH_ID}`,
  `/dispatch/${NO_SUCH_ID}`,
  '/reports',
  '/reports/gst-summary',
  '/reports/outstanding',
  '/reports/sales-summary',
  // The branded 404 is an asserted surface too (verify-day-16), and its
  // not-found boundary compiles like any other route.
  '/this-route-does-not-exist-zzz',
];

/** Operator-console routes, warmed with the seeded platform operator. */
const OPERATOR_ROUTES = [
  '/admin',
  '/admin/tenants',
  '/admin/tenants/new',
  `/admin/tenants/${NO_SUCH_ID}`,
];

/**
 * Compile several routes at once so the dev server uses more than one core.
 * Deliberately modest: `next dev` compilation is memory-hungry and the
 * devcontainer OOM of DEV.87/91 is the reason this suite runs `workers: 1`.
 * Override with E2E_WARMUP_CONCURRENCY when measuring.
 */
const CONCURRENCY = Number(process.env.E2E_WARMUP_CONCURRENCY ?? 4);

/** Per-route ceiling. A cold `/` has been seen at 16.2s on CI; 60s is slack. */
const PER_ROUTE_TIMEOUT = 60_000;

type StorageState = Awaited<ReturnType<BrowserContext['storageState']>>;

async function warm(
  label: string,
  baseURL: string,
  routes: string[],
  storageState: StorageState | undefined,
): Promise<void> {
  const ctx = await request.newContext({
    baseURL,
    ...(storageState ? { storageState } : {}),
  });
  const queue = [...routes];
  let slowest = { route: '', ms: 0 };

  const worker = async (): Promise<void> => {
    for (;;) {
      const route = queue.shift();
      if (route === undefined) return;
      const started = Date.now();
      try {
        await ctx.get(route, { timeout: PER_ROUTE_TIMEOUT, failOnStatusCode: false });
      } catch (err) {
        // A route that will not answer is a real problem, but it is the
        // suite's problem to report, with its own assertion and its own
        // diagnostics. Warm-up only ever logs.
        console.warn(`[warm-up] ${label} ${route} did not answer: ${(err as Error).message}`);
      }
      const ms = Date.now() - started;
      if (ms > slowest.ms) slowest = { route, ms };
    }
  };

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, routes.length) }, worker));
  await ctx.dispose();
  console.log(
    `[warm-up] ${label}: ${routes.length} routes, slowest ${slowest.route} at ${(slowest.ms / 1000).toFixed(1)}s`,
  );
}

/**
 * Sign in through the real login form and hand back the resulting cookies.
 * Going through a browser rather than hand-rolling the Server Action POST
 * keeps this on exactly the path `helpers.loginAs` uses, so the warm-up cannot
 * drift away from how the suite actually authenticates.
 */
async function storageStateFor(
  baseURL: string,
  email: string,
  password: string,
  loginPath: string,
  landing: RegExp,
): Promise<StorageState | undefined> {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ baseURL });
    const page = await context.newPage();
    await page.goto(loginPath);
    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', password);
    await page.click('button[type="submit"]');
    await page.waitForURL(landing, { timeout: 60_000 });
    return await context.storageState();
  } catch (err) {
    console.warn(`[warm-up] could not sign in as ${email}: ${(err as Error).message}`);
    return undefined;
  } finally {
    await browser.close();
  }
}

export default async function globalSetup(config: FullConfig): Promise<void> {
  if (process.env.E2E_SKIP_WARMUP === '1') {
    console.log('[warm-up] skipped (E2E_SKIP_WARMUP=1)');
    return;
  }

  const baseURL = config.projects[0]?.use.baseURL;
  if (!baseURL) {
    console.warn('[warm-up] no baseURL configured; skipping');
    return;
  }

  const started = Date.now();

  // Public routes first and unauthenticated — /login is what every spec hits
  // before anything else, and it is the one route the sign-ins below depend on.
  await warm('public', baseURL, PUBLIC_ROUTES, undefined);

  const [tenantState, operatorState] = await Promise.all([
    storageStateFor(
      baseURL,
      SEEDED_USERS.demo.admin.email,
      SEEDED_USERS.demo.admin.password,
      '/login?tenant=demo',
      /dashboard|change-password|inventory|pipeline/,
    ),
    storageStateFor(
      baseURL,
      SEEDED_USERS.operator.email,
      SEEDED_USERS.operator.password,
      '/login',
      /admin/,
    ),
  ]);

  await Promise.all([
    warm('tenant', baseURL, TENANT_ROUTES, tenantState),
    warm('operator', baseURL, OPERATOR_ROUTES, operatorState),
  ]);

  console.log(`[warm-up] complete in ${((Date.now() - started) / 1000).toFixed(1)}s`);
}
