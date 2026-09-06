#!/usr/bin/env node
/**
 * verify-deploy.mjs — confirm a DigitalOcean App Platform deploy actually
 * landed, not just that a push happened.
 *
 * WHY THIS EXISTS: the DO pipeline was silently broken across three commits
 * (cef54d8, 9756c6f, e3e3afe) before anyone noticed — a green `git push` said
 * nothing about whether the build/deploy succeeded. This polls the LATEST
 * deployment of each app until it reaches a terminal phase and reports it.
 *
 * Usage:
 *   node scripts/verify-deploy.mjs            # both apps (default)
 *   node scripts/verify-deploy.mjs staging
 *   node scripts/verify-deploy.mjs production
 *
 * Exit code: 0 iff every polled app's latest deployment is ACTIVE; 1 otherwise
 * (ERROR/CANCELED/SUPERSEDED/timeout/doctl failure) — so CI or a closeout step
 * can gate on it. Requires an authenticated doctl (`doctl auth list`).
 */
import { spawnSync } from 'node:child_process';

const APPS = {
  staging: { id: '77edf06b-3273-479c-ae1c-15caca0db95b', name: 'dealerlink-staging' },
  production: { id: 'd8a25cb8-e4cb-4035-8413-6baab72398cd', name: 'dealerlink-production' },
};

// Phases DO reports; the first four are terminal (no further transition).
const TERMINAL = new Set(['ACTIVE', 'ERROR', 'CANCELED', 'SUPERSEDED']);
const TIMEOUT_MS = 15 * 60 * 1000;
const POLL_MS = 15 * 1000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Latest deployment (id + phase) for an app, or an error string. */
function latest(appId) {
  const res = spawnSync(
    'doctl',
    ['apps', 'list-deployments', appId, '--format', 'ID,Phase', '--no-header'],
    { encoding: 'utf8' },
  );
  if (res.status !== 0) {
    return { error: (res.stderr || res.stdout || 'doctl failed').trim().split('\n')[0] };
  }
  // Latest deployment is the first row. ID and Phase are both whitespace-free.
  const row = (res.stdout || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)[0];
  if (!row) return { error: 'no deployments found' };
  const [id, phase] = row.split(/\s+/);
  return { id, phase };
}

/** Poll one app to a terminal phase. Returns { name, phase, id }. */
async function pollApp({ id, name }) {
  const deadline = Date.now() + TIMEOUT_MS;
  let lastPhase = '';
  for (;;) {
    const { id: depId, phase, error } = latest(id);
    if (error) {
      console.log(`  ${name}: doctl error — ${error}`);
      return { name, phase: 'DOCTL_ERROR', id: null };
    }
    if (phase !== lastPhase) {
      console.log(`  ${new Date().toISOString()} — ${name}: phase=${phase} (deploy ${depId})`);
      lastPhase = phase;
    }
    if (TERMINAL.has(phase)) return { name, phase, id: depId };
    if (Date.now() >= deadline) {
      console.log(`  ${name}: TIMEOUT after ${TIMEOUT_MS / 60000} min at phase=${phase}`);
      return { name, phase: 'TIMEOUT', id: depId };
    }
    await sleep(POLL_MS);
  }
}

const arg = (process.argv[2] || 'both').toLowerCase();
const targets =
  arg === 'both'
    ? Object.values(APPS)
    : APPS[arg]
      ? [APPS[arg]]
      : null;

if (!targets) {
  console.error(`Unknown target "${arg}". Use: staging | production | both`);
  process.exit(2);
}

console.log(`→ Verifying deploy phase for: ${targets.map((t) => t.name).join(', ')}`);

const results = await Promise.all(targets.map(pollApp));

console.log('\nDeploy verification result:');
let ok = true;
for (const r of results) {
  const mark = r.phase === 'ACTIVE' ? '✅' : '❌';
  console.log(`  ${mark} ${r.name}: ${r.phase}`);
  if (r.phase !== 'ACTIVE') ok = false;
}
process.exit(ok ? 0 : 1);
