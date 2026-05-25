// C5c — DB connection-pool load: 10 concurrent users hammering the dashboard.
//
// The dashboard is the heaviest read (many KPI/widget queries per render), so
// 10 concurrent dashboard streams with minimal think-time is the sharpest test
// of the web DB pool (DB_POOL_MAX=2 on staging, DEV.61) and of the global-pool
// fix (DEV.62) under real concurrency. We watch for `53300`
// (connection-slots-reserved) errors and any auth/500 failures — graceful
// queueing (elevated latency, zero errors) is the pass condition.
//
// Streams round-robin the four demo role sessions (all can read the dashboard),
// so this also exercises Lucia session validation under concurrency.
//
//   node scripts/load-test/db-load.mjs
//   LOADTEST_DURATION_S=60 LOADTEST_USERS=10 node ...
import { writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';

import { config, SESSIONS_FILE } from './lib/config.mjs';
import { loadSessions, timedGet } from './lib/http.mjs';
import { fmtSummary, summarize } from './lib/stats.mjs';

const DURATION_S = Number(process.env.LOADTEST_DURATION_S ?? 60);
const USERS = Number(process.env.LOADTEST_USERS ?? 10);
const THINK_MAX_MS = 120;

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

async function main() {
  const sessions = await loadSessions();
  const cookies = ['admin', 'sales', 'accounts', 'dispatch']
    .map((r) => sessions.demo?.[r])
    .filter(Boolean);
  if (cookies.length === 0) throw new Error('No demo cookies — run session.mjs');

  const url = `${config.demoUrl}/dashboard`;
  const samples = [];
  const errors = [];
  let total = 0;
  const deadline = performance.now() + DURATION_S * 1000;

  async function userLoop(i) {
    const cookie = cookies[i % cookies.length];
    while (performance.now() < deadline) {
      const r = await timedGet(url, cookie);
      total += 1;
      if (r.ok) samples.push(Math.round(r.ms));
      else errors.push({ i, status: r.status, authFailed: r.authFailed, error: r.error });
      await sleep(Math.random() * THINK_MAX_MS);
    }
  }

  console.log(`Running ${USERS} concurrent dashboard users for ${DURATION_S}s …`);
  const startedAt = performance.now();
  await Promise.all(Array.from({ length: USERS }, (_, i) => userLoop(i)));
  const elapsedS = (performance.now() - startedAt) / 1000;

  const s = summarize(samples);
  const reqPerSec = Math.round((total / elapsedS) * 10) / 10;
  const errorRate = Math.round((errors.length / total) * 1000) / 10;
  console.log(fmtSummary('dashboard', s));
  console.log(
    `  total=${total}  ok=${samples.length}  errors=${errors.length} (${errorRate}%)  throughput=${reqPerSec} req/s`,
  );
  if (errors.length) console.log('  first errors:', JSON.stringify(errors.slice(0, 5)));

  const out = {
    test: 'db-load',
    capturedAt: new Date().toISOString(),
    target: config.apex,
    profile: { concurrentUsers: USERS, durationS: DURATION_S, endpoint: '/dashboard' },
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
    SESSIONS_FILE.replace('.sessions.json', 'results-db.json'),
    JSON.stringify(out, null, 2),
  );
  console.log('\nWrote results-db.json');
}

main().catch((err) => {
  console.error('db-load failed:', err.message ?? err);
  process.exit(1);
});
