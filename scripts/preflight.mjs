#!/usr/bin/env node
/**
 * Dealerlink preflight — run at the start of every build day.
 *
 * Checks (each prints ✅ / ⚠️ / ❌):
 *   - Git working tree clean
 *   - Local branch in sync with origin (warn if ahead/behind/no remote)
 *   - Docker Desktop running + dealerlink-postgres healthy
 *   - Postgres extensions loaded (uuid-ossp, pg_trgm, btree_gin)
 *   - .env.local present and core secrets are non-placeholder
 *   - Port 3000 free (pnpm dev not running)
 *   - Node 20.x, pnpm 9.x
 *   - No pending Drizzle migrations
 *
 * Exit code: 0 if all green, 1 if any ❌.
 *
 * Runs on both Windows and POSIX — pure Node, no shelling out to bash.
 */
import { exec as cbExec } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const exec = promisify(cbExec);
const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');

const ICON = { ok: '✅', warn: '⚠️', fail: '❌' };
let hardFails = 0;
let warns = 0;

function report(level, name, message) {
  console.log(`${ICON[level]}  ${name.padEnd(28)} ${message ?? ''}`);
  if (level === 'fail') hardFails++;
  if (level === 'warn') warns++;
}

async function tryExec(cmd, opts = {}) {
  try {
    const { stdout, stderr } = await exec(cmd, { cwd: repoRoot, ...opts });
    return { ok: true, stdout: stdout.trim(), stderr: stderr.trim() };
  } catch (err) {
    return { ok: false, stdout: '', stderr: String(err?.message ?? err) };
  }
}

async function checkGitClean() {
  const r = await tryExec('git status --porcelain');
  if (!r.ok) return report('fail', 'Git', 'git not available');
  if (r.stdout.length > 0) {
    return report('warn', 'Git working tree', 'has uncommitted changes');
  }
  report('ok', 'Git working tree', 'clean');
}

async function checkGitSync() {
  const r = await tryExec('git rev-parse --abbrev-ref HEAD');
  if (!r.ok) return;
  const branch = r.stdout;
  const upstream = await tryExec(`git rev-parse --abbrev-ref --symbolic-full-name ${branch}@{u}`);
  if (!upstream.ok) {
    return report('warn', 'Git remote sync', `branch ${branch} has no upstream`);
  }
  const ahead = await tryExec(`git rev-list --count ${upstream.stdout}..${branch}`);
  const behind = await tryExec(`git rev-list --count ${branch}..${upstream.stdout}`);
  const a = Number(ahead.stdout ?? 0);
  const b = Number(behind.stdout ?? 0);
  if (a === 0 && b === 0) return report('ok', 'Git remote sync', `in sync with ${upstream.stdout}`);
  return report('warn', 'Git remote sync', `${a} ahead / ${b} behind ${upstream.stdout}`);
}

async function checkDocker() {
  const r = await tryExec('docker info --format "ok"');
  if (!r.ok) return report('fail', 'Docker', 'docker daemon not reachable');
  report('ok', 'Docker', 'running');
  const ps = await tryExec('docker inspect --format "{{.State.Health.Status}}" dealerlink-postgres');
  if (!ps.ok) return report('fail', 'Postgres container', 'dealerlink-postgres not found');
  if (ps.stdout !== 'healthy') {
    return report('fail', 'Postgres container', `status=${ps.stdout}`);
  }
  report('ok', 'Postgres container', 'healthy');
}

async function checkExtensions() {
  const r = await tryExec(
    `docker exec dealerlink-postgres psql -U dealerlink -d dealerlink_dev -tA -c "SELECT extname FROM pg_extension ORDER BY 1;"`,
  );
  if (!r.ok) return report('fail', 'Postgres extensions', 'cannot query pg_extension');
  const have = new Set(r.stdout.split(/\r?\n/).map((s) => s.trim()).filter(Boolean));
  const missing = ['uuid-ossp', 'pg_trgm', 'btree_gin'].filter((e) => !have.has(e));
  if (missing.length > 0) {
    return report('fail', 'Postgres extensions', `missing: ${missing.join(', ')}`);
  }
  report('ok', 'Postgres extensions', 'uuid-ossp, pg_trgm, btree_gin loaded');
}

function checkEnv() {
  const envPath = path.resolve(repoRoot, '.env.local');
  if (!existsSync(envPath)) {
    return report('fail', '.env.local', 'missing');
  }
  const text = readFileSync(envPath, 'utf8');
  const required = ['SESSION_SECRET', 'DATABASE_URL'];
  const placeholders = ['changeme', 'placeholder', 'your-key-here'];
  const missing = [];
  const looksFake = [];
  for (const key of required) {
    const m = text.match(new RegExp(`^${key}=(.*)$`, 'm'));
    if (!m) {
      missing.push(key);
      continue;
    }
    const value = m[1].trim().replace(/^['"]|['"]$/g, '');
    if (value.length === 0 || placeholders.some((p) => value.toLowerCase().includes(p))) {
      looksFake.push(key);
    }
  }
  if (missing.length > 0) return report('fail', '.env.local', `missing keys: ${missing.join(', ')}`);
  if (looksFake.length > 0) return report('warn', '.env.local', `placeholder values: ${looksFake.join(', ')}`);
  report('ok', '.env.local', `${required.length} core secrets set`);
}

function checkPort(port) {
  return new Promise((resolve) => {
    const sock = net.createConnection({ host: '127.0.0.1', port }, () => {
      sock.end();
      report('warn', `Port ${port}`, 'something is already listening (pnpm dev?)');
      resolve();
    });
    sock.on('error', () => {
      report('ok', `Port ${port}`, 'free');
      resolve();
    });
  });
}

async function checkNodeAndPnpm() {
  const node = process.versions.node;
  if (node.startsWith('20.')) report('ok', 'Node version', node);
  else report('warn', 'Node version', `${node} (expected 20.x)`);
  const r = await tryExec('pnpm --version');
  if (!r.ok) return report('fail', 'pnpm', 'not on PATH');
  if (r.stdout.startsWith('9.')) report('ok', 'pnpm version', r.stdout);
  else report('warn', 'pnpm version', `${r.stdout} (expected 9.x)`);
}

async function checkMigrations() {
  // Cheap check: are there any *.sql files in migrations/ that don't show up in
  // drizzle's __drizzle_migrations table?
  const r = await tryExec(
    `docker exec dealerlink-postgres psql -U dealerlink -d dealerlink_dev -tA -c "SELECT count(*) FROM drizzle.__drizzle_migrations;"`,
  );
  if (!r.ok) return report('warn', 'Migrations', 'cannot read __drizzle_migrations (first run?)');
  const applied = Number(r.stdout);
  const migrationsDir = path.resolve(repoRoot, 'packages/db/migrations');
  let onDisk = 0;
  try {
    const { readdirSync } = await import('node:fs');
    onDisk = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).length;
  } catch {
    /* ignore */
  }
  if (onDisk === 0) return report('warn', 'Migrations', 'no migrations on disk');
  if (applied >= onDisk) report('ok', 'Migrations', `${applied} applied / ${onDisk} on disk`);
  else report('fail', 'Migrations', `pending: ${onDisk - applied} not yet applied`);
}

async function main() {
  console.log('\nDealerlink preflight\n────────────────────');
  await checkGitClean();
  await checkGitSync();
  await checkDocker();
  await checkExtensions();
  checkEnv();
  await checkPort(3000);
  await checkNodeAndPnpm();
  await checkMigrations();
  console.log('────────────────────');
  if (hardFails > 0) {
    console.log(`${ICON.fail}  ${hardFails} hard failure(s), ${warns} warning(s)`);
    process.exit(1);
  } else if (warns > 0) {
    console.log(`${ICON.warn}  ${warns} warning(s) — proceed if expected`);
  } else {
    console.log(`${ICON.ok}  All checks passed`);
  }
}

await main();
