// C5a — Light load: 5 concurrent users for 2 minutes.
//
// Five independent request streams each walk the read path at random with a
// short think-time between requests — mimicking a pilot's realistic first-week
// load (≤5 concurrent users). This is the test that exercises the web app's
// capped DB pool (DB_POOL_MAX=2 on staging, DEV.61) under concurrency, so
// any pool-queueing latency shows up in p95/p99 vs the single-user baseline.
//
// Uses the demo/admin session for all five streams: the goal is to measure
// server-side concurrency, and role-gated routes would otherwise inject
// false "errors" from authorization redirects.
//
//   node scripts/load-test/light-load.mjs           # 120s, 5 users
//   LOADTEST_DURATION_S=60 LOADTEST_USERS=5 node ...
import { writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';

import { config, SESSIONS_FILE } from './lib/config.mjs';
import { getHtml, loadSessions, scrapeIds, timedGet } from './lib/http.mjs';
import { fmtSummary, summarize } from './lib/stats.mjs';

const DURATION_S = Number(process.env.LOADTEST_DURATION_S ?? 120);
const USERS = Number(process.env.LOADTEST_USERS ?? 5);
const THINK_MIN_MS = 250;
const THINK_MAX_MS = 750;

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
const jitter = () => THINK_MIN_MS + Math.random() * (THINK_MAX_MS - THINK_MIN_MS);

async function main() {
  const sessions = await loadSessions();
  const cookie = sessions.demo?.admin;
  if (!cookie) throw new Error('No demo/admin cookie — run session.mjs');

  const list = await getHtml(`${config.demoUrl}/quotations`, cookie);
  const ids = scrapeIds(list.html, 'quotations', 5);
  if (ids.length === 0) throw new Error('Could not scrape a quotation id');
  const qid = ids[0];

  const path = [
    `${config.demoUrl}/dashboard`,
    `${config.demoUrl}/quotations`,
    `${config.demoUrl}/quotations/${qid}`,
    `${config.demoUrl}/reports/gst-summary`,
  ];

  const samples = [];
  const errors = [];
  let total = 0;
  const deadline = performance.now() + DURATION_S * 1000;

  async function userLoop(userId) {
    while (performance.now() < deadline) {
      const url = path[Math.floor(Math.random() * path.length)];
      const r = await timedGet(url, cookie);
      total += 1;
      if (r.ok) samples.push(Math.round(r.ms));
      else errors.push({ userId, url, status: r.status, authFailed: r.authFailed, error: r.error });
      await sleep(jitter());
    }
  }

  console.log(`Running ${USERS} concurrent users for ${DURATION_S}s against ${config.demoUrl} …`);
  const startedAt = performance.now();
  await Promise.all(Array.from({ length: USERS }, (_, i) => userLoop(i)));
  const elapsedS = (performance.now() - startedAt) / 1000;

  const s = summarize(samples);
  const reqPerSec = Math.round((total / elapsedS) * 10) / 10;
  const errorRate = Math.round((errors.length / total) * 1000) / 10;

  console.log(fmtSummary('mixed-read-path', s));
  console.log(
    `  total=${total}  ok=${samples.length}  errors=${errors.length} (${errorRate}%)  throughput=${reqPerSec} req/s`,
  );
  if (errors.length) console.log('  first errors:', JSON.stringify(errors.slice(0, 5)));

  const out = {
    test: 'light-load',
    capturedAt: new Date().toISOString(),
    target: config.apex,
    profile: { concurrentUsers: USERS, durationS: DURATION_S, thinkMs: [THINK_MIN_MS, THINK_MAX_MS] },
    elapsedS: Math.round(elapsedS * 10) / 10,
    totalRequests: total,
    okRequests: samples.length,
    errorCount: errors.length,
    errorRatePct: errorRate,
    throughputReqPerSec: reqPerSec,
    latencyMs: s,
    errorSample: errors.slice(0, 10),
  };
  await writeFile(
    SESSIONS_FILE.replace('.sessions.json', 'results-light.json'),
    JSON.stringify(out, null, 2),
  );
  console.log('\nWrote results-light.json');
}

main().catch((err) => {
  console.error('light-load failed:', err.message ?? err);
  process.exit(1);
});
