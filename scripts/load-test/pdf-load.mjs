// C5b — PDF generation load + cold-start.
//
// PDF rendering is the critical path for the Stage D worker-sizing decision
// (DEV.67). This drives REAL renders through the UI (Server Actions →
// pg-boss render-pdf job → workers Chromium → generated_documents), so the
// measured latency is the true end-to-end the pilot will see.
//
// Profile (operator-approved, pilot-realistic):
//   1. Cold sample   — the FIRST render of the session. The workers Chromium
//      idle-recycles after 45 min (DEV.67); staging has been idle far longer,
//      so this is a genuine cold sample. No forced redeploy.
//   2. Warm singles  — a few sequential renders once Chromium is warm.
//   3. 10-concurrent — fire 10 renders at once, ×3 reps. Throughput + survival.
//      (NO 20/40-concurrent stress, NO deliberate OOM — out of scope.)
//
// "Regenerate PDF" (generateQuotationPdf, admin-only) ALWAYS renders fresh, so
// it is used for every measured render; "Download PDF" is used only to prime a
// quotation that has no prior PDF (so Regenerate becomes available).
//
//   node scripts/load-test/pdf-load.mjs
import { writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';

import { config, SESSIONS_FILE } from './lib/config.mjs';
import { getHtml, loadSessions, scrapeIds } from './lib/http.mjs';
import { getChromium } from './lib/playwright.mjs';
import { fmtSummary, summarize } from './lib/stats.mjs';

const CONCURRENCY = Number(process.env.LOADTEST_PDF_CONCURRENCY ?? 10);
const REPS = Number(process.env.LOADTEST_PDF_REPS ?? 3);
const RENDER_TIMEOUT_MS = 170_000; // > server PDF_RENDER_TIMEOUT_MS (120s) + pool-queue wait

async function login(page) {
  await page.goto(`${config.demoUrl}/login`, { waitUntil: 'domcontentloaded' });
  await page.fill('input[type="email"]', config.users.demo.admin.email);
  await page.fill('input[type="password"]', config.users.demo.admin.password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/dashboard/, { timeout: 60_000 });
}

async function openDetail(context, id) {
  const page = await context.newPage();
  page.setDefaultTimeout(RENDER_TIMEOUT_MS);
  page.on('dialog', (d) => void d.accept()); // Regenerate confirm()
  await page.goto(`${config.demoUrl}/quotations/${id}`, { waitUntil: 'domcontentloaded' });
  await page.locator('h1').first().waitFor({ timeout: 60_000 });
  return page;
}

/** Render once. Prefers Regenerate (always renders); falls back to Download
 *  (renders only when no PDF exists yet). Returns { ms, mode, ok, error }. */
async function renderOnce(page) {
  const regen = page.getByRole('button', { name: 'Regenerate PDF' });
  const hasRegen = (await regen.count()) > 0;
  const start = performance.now();
  if (hasRegen) {
    await regen.click();
    const ok = page.getByText('PDF regenerated.').waitFor({ timeout: RENDER_TIMEOUT_MS }).then(() => true);
    const err = page.locator('.bg-rose-50').waitFor({ timeout: RENDER_TIMEOUT_MS }).then(() => false);
    const success = await Promise.race([ok, err]).catch(() => false);
    const ms = performance.now() - start;
    const error = success ? null : await page.locator('.bg-rose-50').innerText().catch(() => 'error');
    return { ms, mode: 'regenerate', ok: success, error };
  }
  // No prior PDF → Download renders fresh and triggers a browser download.
  const dlPromise = page.waitForEvent('download', { timeout: RENDER_TIMEOUT_MS }).then(() => true);
  const errPromise = page.locator('.bg-rose-50').waitFor({ timeout: RENDER_TIMEOUT_MS }).then(() => false);
  await page.getByRole('button', { name: 'Download PDF' }).click();
  const success = await Promise.race([dlPromise, errPromise]).catch(() => false);
  const ms = performance.now() - start;
  const error = success ? null : await page.locator('.bg-rose-50').innerText().catch(() => 'timeout/error');
  return { ms, mode: 'download', ok: success, error };
}

async function main() {
  const sessions = await loadSessions();
  if (!sessions.demo?.admin) throw new Error('No demo/admin cookie — run session.mjs');

  const list = await getHtml(`${config.demoUrl}/quotations`, sessions.demo.admin);
  const ids = scrapeIds(list.html, 'quotations', CONCURRENCY + 5);
  if (ids.length < CONCURRENCY) {
    throw new Error(`Need ${CONCURRENCY} quotation ids; scraped ${ids.length}`);
  }
  const targets = ids.slice(0, CONCURRENCY);
  console.log(`Targets: ${CONCURRENCY} quotations on ${config.demoUrl}`);

  const chromium = await getChromium();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const out = {
    test: 'pdf-load',
    capturedAt: new Date().toISOString(),
    target: config.apex,
    profile: { concurrency: CONCURRENCY, reps: REPS, renderTimeoutMs: RENDER_TIMEOUT_MS },
  };

  try {
    const loginPage = await context.newPage();
    await login(loginPage);
    await loginPage.close();

    // 1. Cold sample — the first render of the session.
    console.log('\n[1] Cold sample (first render after long idle) …');
    const coldPage = await openDetail(context, targets[0]);
    const cold = await renderOnce(coldPage);
    await coldPage.close();
    console.log(`  cold render: ${Math.round(cold.ms)}ms via ${cold.mode} (ok=${cold.ok})`);
    out.cold = { ms: Math.round(cold.ms), mode: cold.mode, ok: cold.ok, error: cold.error };

    // 2. Warm singles — Chromium now warm.
    console.log('\n[2] Warm single renders (×3, sequential) …');
    const warmSamples = [];
    for (let i = 0; i < 3; i += 1) {
      const p = await openDetail(context, targets[0]);
      const r = await renderOnce(p);
      await p.close();
      if (r.ok) warmSamples.push(Math.round(r.ms));
      console.log(`  warm[${i}]: ${Math.round(r.ms)}ms (ok=${r.ok})`);
    }
    out.warmSingle = summarize(warmSamples);

    // 3. Prime targets[1..] so Regenerate is available on every page.
    console.log('\n[3] Priming remaining targets (ensure each has a PDF) …');
    for (let i = 1; i < targets.length; i += 1) {
      const p = await openDetail(context, targets[i]);
      const hasRegen = (await p.getByRole('button', { name: 'Regenerate PDF' }).count()) > 0;
      if (!hasRegen) {
        const r = await renderOnce(p); // Download renders + creates the PDF
        console.log(`  primed ${i}: ${Math.round(r.ms)}ms (ok=${r.ok})`);
      }
      await p.close();
    }

    // 4. Concurrent renders ×REPS.
    console.log(`\n[4] ${CONCURRENCY}-concurrent renders ×${REPS} reps …`);
    out.concurrent = [];
    const allConcurrentSamples = [];
    for (let rep = 0; rep < REPS; rep += 1) {
      const pages = [];
      for (let i = 0; i < CONCURRENCY; i += 1) pages.push(await openDetail(context, targets[i]));
      const t0 = performance.now();
      const results = await Promise.all(
        pages.map(async (p) => {
          const r = await renderOnce(p);
          return { ...r, completedAt: performance.now() - t0 };
        }),
      );
      for (const p of pages) await p.close();

      const oks = results.filter((r) => r.ok);
      const samples = oks.map((r) => Math.round(r.ms));
      allConcurrentSamples.push(...samples);
      const makespanMs = Math.round(Math.max(...results.map((r) => r.completedAt)));
      const failures = results.length - oks.length;
      const throughputPerMin = Math.round((oks.length / (makespanMs / 1000)) * 60 * 10) / 10;
      const s = summarize(samples);
      out.concurrent.push({
        rep,
        ok: oks.length,
        failures,
        makespanMs,
        throughputPerMin,
        latencyMs: s,
        failureSample: results.filter((r) => !r.ok).slice(0, 5).map((r) => r.error),
      });
      console.log(
        `  rep ${rep}: ok=${oks.length}/${CONCURRENCY} failures=${failures} makespan=${makespanMs}ms throughput=${throughputPerMin}/min ${fmtSummary('', s)}`,
      );
    }
    out.concurrentAggregate = summarize(allConcurrentSamples);
  } finally {
    await browser.close();
  }

  await writeFile(
    SESSIONS_FILE.replace('.sessions.json', 'results-pdf.json'),
    JSON.stringify(out, null, 2),
  );
  console.log('\nWrote results-pdf.json');
}

main().catch((err) => {
  console.error('pdf-load failed:', err.message ?? err);
  process.exit(1);
});
