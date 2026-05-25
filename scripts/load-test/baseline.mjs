// C5a — Baseline single-user latency.
//
// Walks the core read path as one admin user, sequentially, with no
// concurrency: dashboard → quotations list → quotation detail → GST summary
// report → /api/health. One warmup round (discarded) settles TLS/keep-alive,
// then 5 measured iterations per endpoint. Writes results-baseline.json.
//
//   node scripts/load-test/baseline.mjs
import { writeFile } from 'node:fs/promises';

import { config, SESSIONS_FILE } from './lib/config.mjs';
import { getHtml, loadSessions, scrapeIds, timedGet } from './lib/http.mjs';
import { fmtSummary, summarize } from './lib/stats.mjs';

const ITERATIONS = 5;

async function main() {
  const sessions = await loadSessions();
  const cookie = sessions.demo?.admin;
  if (!cookie) throw new Error('No demo/admin cookie — run session.mjs');

  // Resolve a real quotation id for the detail page.
  const list = await getHtml(`${config.demoUrl}/quotations`, cookie);
  const ids = scrapeIds(list.html, 'quotations', 5);
  if (ids.length === 0) throw new Error('Could not scrape a quotation id from /quotations');
  const quotationId = ids[0];

  const endpoints = [
    { name: 'dashboard', url: `${config.demoUrl}/dashboard`, cookie },
    { name: 'quotations-list', url: `${config.demoUrl}/quotations`, cookie },
    { name: 'quotation-detail', url: `${config.demoUrl}/quotations/${quotationId}`, cookie },
    { name: 'report-gst-summary', url: `${config.demoUrl}/reports/gst-summary`, cookie },
    { name: 'api-health', url: config.healthUrl, cookie: null },
  ];

  // Warmup round (discarded).
  for (const e of endpoints) await timedGet(e.url, e.cookie);

  const results = {};
  for (const e of endpoints) {
    const samples = [];
    let failures = 0;
    for (let i = 0; i < ITERATIONS; i += 1) {
      const r = await timedGet(e.url, e.cookie);
      if (r.ok) samples.push(Math.round(r.ms));
      else failures += 1;
      if (r.authFailed) console.warn(`  ! ${e.name}: auth failed (redirected to /login)`);
      if (r.error) console.warn(`  ! ${e.name}: ${r.error}`);
    }
    const s = summarize(samples);
    s.failures = failures;
    results[e.name] = s;
    console.log(fmtSummary(e.name, s));
  }

  const out = {
    test: 'baseline',
    capturedAt: new Date().toISOString(),
    target: config.apex,
    profile: { concurrency: 1, iterations: ITERATIONS, warmup: 1 },
    quotationId,
    endpoints: results,
  };
  await writeFile(
    SESSIONS_FILE.replace('.sessions.json', 'results-baseline.json'),
    JSON.stringify(out, null, 2),
  );
  console.log('\nWrote results-baseline.json');
}

main().catch((err) => {
  console.error('baseline failed:', err.message ?? err);
  process.exit(1);
});
