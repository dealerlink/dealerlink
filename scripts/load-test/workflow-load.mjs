// C5c — Multi-user concurrent-write isolation test.
//
// Goal (operator intent): transaction-isolation correctness + RLS under
// concurrent writes — NOT throughput, and deliberately NOT the PDF-render path
// (C5b already showed that is the worker bottleneck; "Save & send" renders a
// PDF, so this uses "Save as draft" to isolate the write/transaction path).
//
// Concurrent draft-quotation creation is the sharpest isolation test the app
// has: every create atomically bumps the per-tenant `document_counters` row for
// the QT number (CLAUDE.md §4.3) inside a `withTenant` transaction. If isolation
// or the counter lock were wrong, concurrent creates would deadlock, error, or
// hand out duplicate QT numbers.
//
// Setup: 3 demo writers (admin, sales, admin) each create N drafts, plus a
// concurrent sample-tenant writer — used to assert cross-tenant RLS holds while
// both tenants write at once. Post-run assertions:
//   1. zero errors / deadlocks
//   2. demo QT numbers all unique (no counter race)
//   3. a sample-created quotation id is NOT readable from a demo session, and
//      vice-versa (RLS holds under concurrent writes)
//
//   node scripts/load-test/workflow-load.mjs
import { writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';

import { config, SESSIONS_FILE } from './lib/config.mjs';
import { getHtml, loadSessions } from './lib/http.mjs';
import { getChromium } from './lib/playwright.mjs';
import { fmtSummary, summarize } from './lib/stats.mjs';

const PER_WORKER = Number(process.env.LOADTEST_WF_PER_WORKER ?? 2);

function authedContext(browser, cookieValue) {
  return browser.newContext().then(async (context) => {
    await context.addCookies([
      {
        name: config.cookieName,
        value: cookieValue,
        domain: '.dealerlink.in',
        path: '/',
        secure: true,
        httpOnly: true,
        sameSite: 'Lax',
      },
    ]);
    return context;
  });
}

/** Create one draft quotation (no PDF). Returns { ms, id, qtNumber, ok, error }. */
async function createDraft(page, baseUrl) {
  const start = performance.now();
  try {
    await page.goto(`${baseUrl}/quotations/new`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: 'New quotation' }).waitFor({ timeout: 60_000 });
    await page.getByLabel('Dealer').selectOption({ index: 1 });
    await page.getByLabel('Add a product line').selectOption({ index: 1 });
    const qty = page.getByLabel(/^Quantity for/).first();
    await qty.waitFor({ timeout: 15_000 });
    await qty.fill('2');
    const unit = page.getByLabel(/^Unit price for/).first();
    const uv = await unit.inputValue();
    if (!uv || Number(uv) === 0) await unit.fill('12000');
    await page.getByRole('button', { name: 'Save as draft' }).click();
    await page.waitForURL(/\/quotations\/[0-9a-f-]+$/, { timeout: 45_000 });
    const id = page.url().split('/').pop();
    const h1 = await page.locator('h1').first().innerText();
    const qt = h1.match(/QT-\d{4}-\d+/)?.[0] ?? null;
    return { ms: performance.now() - start, id, qtNumber: qt, ok: true, error: null };
  } catch (err) {
    return { ms: performance.now() - start, id: null, qtNumber: null, ok: false, error: String(err.message ?? err).split('\n')[0] };
  }
}

async function runWorker(browser, label, cookie, baseUrl, jitterMs) {
  await new Promise((r) => setTimeout(r, jitterMs));
  const context = await authedContext(browser, cookie);
  const page = await context.newPage();
  page.setDefaultTimeout(60_000);
  const created = [];
  for (let i = 0; i < PER_WORKER; i += 1) {
    const r = await createDraft(page, baseUrl);
    created.push(r);
    console.log(`  ${label}[${i}]: ${Math.round(r.ms)}ms ${r.qtNumber ?? '(fail)'} ok=${r.ok}${r.error ? ' err=' + r.error : ''}`);
  }
  await context.close();
  return { label, created };
}

async function main() {
  const sessions = await loadSessions();
  const dAdmin = sessions.demo?.admin;
  const dSales = sessions.demo?.sales;
  const sAdmin = sessions.sample?.admin;
  if (!dAdmin || !dSales || !sAdmin) throw new Error('Missing cookies — run session.mjs');

  const chromium = await getChromium();
  const browser = await chromium.launch({ headless: true });
  const out = {
    test: 'workflow-load',
    capturedAt: new Date().toISOString(),
    target: config.apex,
    profile: { demoWorkers: 3, sampleWorkers: 1, perWorker: PER_WORKER, write: 'draft-quotation (no PDF)' },
  };

  try {
    console.log('Running 3 demo + 1 sample concurrent write workers …');
    const workers = [
      runWorker(browser, 'demo/admin', dAdmin, config.demoUrl, Math.random() * 1000),
      runWorker(browser, 'demo/sales', dSales, config.demoUrl, Math.random() * 1000),
      runWorker(browser, 'demo/admin2', dAdmin, config.demoUrl, Math.random() * 1000),
      runWorker(browser, 'sample/admin', sAdmin, config.sampleUrl, Math.random() * 1000),
    ];
    const t0 = performance.now();
    const results = await Promise.all(workers);
    const wallMs = Math.round(performance.now() - t0);

    const demo = results.filter((w) => w.label.startsWith('demo'));
    const sample = results.filter((w) => w.label.startsWith('sample'));
    const demoCreated = demo.flatMap((w) => w.created);
    const sampleCreated = sample.flatMap((w) => w.created);
    const allOk = [...demoCreated, ...sampleCreated];
    const failures = allOk.filter((c) => !c.ok);
    const demoLat = demoCreated.filter((c) => c.ok).map((c) => Math.round(c.ms));

    // Assertion 1: no errors / deadlocks.
    const noErrors = failures.length === 0;

    // Assertion 2: demo QT numbers unique (no counter race).
    const demoQts = demoCreated.filter((c) => c.ok).map((c) => c.qtNumber);
    const uniqueQts = new Set(demoQts);
    const qtRace = demoQts.length !== uniqueQts.size;

    // Assertion 3: cross-tenant RLS under concurrent writes.
    // A "leak" is the OTHER tenant's quotation actually RENDERING, not the HTTP
    // status: Next's notFound() returns HTTP 200, so status alone is ambiguous.
    // The discriminator is whether the quotation's detail content renders — a
    // not-found page has no QT-#### in the body and none of the detail chrome.
    const demoId = demoCreated.find((c) => c.ok)?.id;
    const sampleId = sampleCreated.find((c) => c.ok)?.id;
    let rlsLeak = false;
    const rlsChecks = [];
    const rendersQuotation = async (url, cookie) => {
      const { status, html } = await getHtml(url, cookie);
      const hasQt = /QT-\d{4}-\d{4}/.test(html);
      const hasChrome = /Download PDF|Place of supply|Bill to/i.test(html);
      return { status, renders: hasQt && hasChrome };
    };
    if (sampleId) {
      const r = await rendersQuotation(`${config.demoUrl}/quotations/${sampleId}`, dAdmin);
      rlsChecks.push({ from: 'demo', target: 'sample-quotation', status: r.status, renders: r.renders, leaked: r.renders });
      rlsLeak = rlsLeak || r.renders;
    }
    if (demoId) {
      const r = await rendersQuotation(`${config.sampleUrl}/quotations/${demoId}`, sAdmin);
      rlsChecks.push({ from: 'sample', target: 'demo-quotation', status: r.status, renders: r.renders, leaked: r.renders });
      rlsLeak = rlsLeak || r.renders;
    }

    const lat = summarize(demoLat);
    out.wallMs = wallMs;
    out.created = { demo: demoCreated.length, sample: sampleCreated.length, failures: failures.length };
    out.perWorkerLatencyMs = results.map((w) => ({
      label: w.label,
      samples: w.created.map((c) => Math.round(c.ms)),
    }));
    out.demoCreateLatencyMs = lat;
    out.assertions = {
      noErrors,
      demoQtNumbersUnique: !qtRace,
      demoQtNumbers: demoQts,
      rlsHoldsUnderConcurrentWrites: !rlsLeak,
      rlsChecks,
    };
    out.failureSample = failures.slice(0, 5).map((f) => f.error);

    console.log(`\n  wall=${wallMs}ms  created demo=${demoCreated.length} sample=${sampleCreated.length} failures=${failures.length}`);
    console.log(fmtSummary('  demo create latency', lat));
    console.log(`  ASSERT no-errors:              ${noErrors ? 'PASS' : 'FAIL'}`);
    console.log(`  ASSERT demo QT numbers unique: ${!qtRace ? 'PASS' : 'FAIL'} (${demoQts.join(', ')})`);
    console.log(`  ASSERT RLS under concurrency:  ${!rlsLeak ? 'PASS' : 'FAIL — LEAK'} ${JSON.stringify(rlsChecks)}`);
  } finally {
    await browser.close();
  }

  await writeFile(
    SESSIONS_FILE.replace('.sessions.json', 'results-workflow.json'),
    JSON.stringify(out, null, 2),
  );
  console.log('\nWrote results-workflow.json');
}

main().catch((err) => {
  console.error('workflow-load failed:', err.message ?? err);
  process.exit(1);
});
