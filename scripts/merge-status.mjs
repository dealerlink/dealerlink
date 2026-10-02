#!/usr/bin/env node
/**
 * `pnpm merge-status` — what state is the project actually in, after a merge.
 *
 * ## THE REQUIREMENT IS CORRESPONDENCE, NOT HEALTH (F.173)
 *
 * **Deploy phase answers "is something running". It never answers "is THIS
 * running."** F.6's merge is the worked example: both apps sat `ACTIVE` for two
 * days on `9537024`, the MERGE-BASE, while `main` carried ten commits beyond it.
 * Every health signal was green. `scripts/verify-deploy.mjs` returned exit 0. A
 * summary that reported phase would have said "fine" throughout.
 *
 * So this reports the **deployed SHA against the latest merge commit on `main`**
 * and says plainly when they differ.
 *
 * Same discipline for migrations. `/api/health`'s own status is `applied > 0`
 * (`apps/web/app/api/health/route.ts`), so F.139 established it returns `ok` at
 * **17 applied against 21**. This compares `applied` against the LENGTH of
 * `packages/db/migrations/meta/_journal.json` and names the gap, because
 * `deploy_on_push` ships code and never schema (F.138) and that gap is otherwise
 * invisible.
 *
 * ## WHY A SCRIPT AND NOT A WORKFLOW
 *
 * A GitHub Actions job would need `doctl` credentials in CI — **a production API
 * token in GitHub secrets so that a summary can be generated.** That token can
 * create, update and destroy apps and databases; it is a real expansion of blast
 * radius for a convenience. A script also keeps the output reviewable before a
 * recipient sees it.
 *
 * ## WRITTEN AGAINST THE SHAPE F.176 WILL LAND ON
 *
 * The migration counts come from `/api/health`, which today answers
 * unauthenticated. **F.176 will move that detail behind a shared secret**, because
 * the same response names tables missing RLS or an audit trigger — and names them
 * precisely when some are missing. So the endpoint and its credential are read from
 * configuration here, never hardcoded, and a 401/403 is reported as
 * "detail withheld" rather than as a failure. Otherwise this breaks the moment
 * F.176 ships, and breaks SILENTLY, because an unreachable endpoint and a healthy
 * one with no detail look alike to a script not written to tell them apart.
 *
 * Usage:
 *   pnpm merge-status
 *   HEALTH_TOKEN=… pnpm merge-status     # once F.176 lands
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const APPS = {
  staging: {
    id: '77edf06b-3273-479c-ae1c-15caca0db95b',
    // Overridable so this keeps working when F.176 moves the detail, and so a
    // custom domain or a preview environment can be pointed at.
    health:
      process.env.STAGING_HEALTH_URL ??
      'https://dealerlink-staging-34jng.ondigitalocean.app/api/health',
  },
  production: {
    id: 'd8a25cb8-e4cb-4035-8413-6baab72398cd',
    health:
      process.env.PRODUCTION_HEALTH_URL ??
      'https://dealerlink-production-8treh.ondigitalocean.app/api/health',
  },
};

const sh = (cmd, args) =>
  execFileSync(cmd, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    // 64 MB. The default is 1 MB and `doctl apps list-deployments --output json`
    // exceeds it — which surfaced as "doctl failed: ENOBUFS" and read like an auth
    // or network problem rather than a buffer one.
    maxBuffer: 64 * 1024 * 1024,
  });

/** The latest MERGE commit on main — the thing a deploy is supposed to carry. */
function latestMergeOnMain() {
  const line = sh('git', [
    'log',
    'origin/main',
    '--merges',
    '-n',
    '1',
    '--format=%H%x09%s%x09%cI',
  ]).trim();
  if (!line) return null;
  const [sha, subject, when] = line.split('\t');
  return { sha, subject, when };
}

/** Deployment facts, from the field rather than from parsing the cause prose. */
function deployment(appId) {
  const raw = sh('doctl', ['apps', 'list-deployments', appId, '--output', 'json']);
  const list = JSON.parse(raw);
  if (!Array.isArray(list) || list.length === 0) return null;
  const d = list[0];
  // `services[0].source_commit_hash` is the real SHA. The `cause` string also
  // carries a short one, but parsing prose when a field exists is how a summary
  // starts reporting something subtly different from what it claims.
  const sha =
    d.services?.[0]?.source_commit_hash ??
    d.workers?.[0]?.source_commit_hash ??
    null;
  return { phase: d.phase, sha, createdAt: d.created_at, cause: d.cause };
}

async function health(url) {
  const headers = {};
  // F.176 will require this. Absent today, and absence is not an error.
  if (process.env.HEALTH_TOKEN) headers.authorization = `Bearer ${process.env.HEALTH_TOKEN}`;
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(20_000) });
    if (res.status === 401 || res.status === 403) {
      return { reachable: true, withheld: true, status: res.status };
    }
    if (!res.ok) return { reachable: true, httpError: res.status };
    const body = await res.json();
    return {
      reachable: true,
      status: body.status ?? null,
      // May be absent once F.176 reduces the public response. Absent is distinct
      // from zero and is reported as such.
      applied: body.checks?.migrations?.applied ?? null,
      version: body.version ?? null,
    };
  } catch (err) {
    return { reachable: false, error: err instanceof Error ? err.message : String(err) };
  }
}

function journalLength() {
  const j = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'packages/db/migrations/meta/_journal.json'), 'utf8'),
  );
  return j.entries.length;
}

/** Rows closed and filed by the latest merge, read from the plan JSON's diff. */
function planDelta(mergeSha) {
  const read = (ref) => {
    try {
      return JSON.parse(sh('git', ['show', `${ref}:docs/stage-f-tasks.json`])).tasks;
    } catch {
      return null;
    }
  };
  const after = read(mergeSha);
  const before = read(`${mergeSha}^1`);
  if (!after || !before) return null;
  const beforeById = new Map(before.map((t) => [t.id, t]));
  const closed = after
    .filter((t) => t.status === 'complete' && beforeById.get(t.id)?.status !== 'complete')
    .map((t) => t.id);
  const filed = after.filter((t) => !beforeById.has(t.id)).map((t) => t.id);
  return { closed, filed, total: after.length };
}

/**
 * The individual CHECK RUNS for a commit.
 *
 * NOT `gh run list`, which returns the WORKFLOW run — one row called "verify" —
 * where the four required checks (`checks`, `test`, `e2e`, `typst-determinism`)
 * are jobs inside it. A summary reporting "verify: success" would be reporting one
 * aggregate and calling it four checks.
 */
function ciChecks(mergeSha) {
  try {
    const raw = sh('gh', [
      'api',
      `repos/{owner}/{repo}/commits/${mergeSha}/check-runs?per_page=50`,
      '--jq',
      '.check_runs[] | {name: .name, conclusion: .conclusion, status: .status}',
    ]);
    return raw
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l));
  } catch {
    return null;
  }
}

const ok = (b) => (b ? '✓' : '✗');

async function main() {
  const merge = latestMergeOnMain();
  const journal = journalLength();
  let problems = 0;

  console.log('');
  if (!merge) {
    console.log('No merge commit found on origin/main.');
    process.exit(1);
  }
  console.log(`LATEST MERGE ON main  ${merge.sha.slice(0, 7)}  ${merge.when}`);
  console.log(`  ${merge.subject}`);
  console.log('');

  console.log('DEPLOYS — the question is whether the deploy CARRIES this merge,');
  console.log('          not whether something is running.');
  for (const [name, app] of Object.entries(APPS)) {
    let d = null;
    try {
      d = deployment(app.id);
    } catch (err) {
      console.log(`  ${name.padEnd(11)} doctl failed: ${String(err).split('\n')[0].slice(0, 70)}`);
      problems++;
      continue;
    }
    if (!d) {
      console.log(`  ${name.padEnd(11)} no deployments`);
      problems++;
      continue;
    }
    const carries = d.sha === merge.sha;
    const settled = d.phase === 'ACTIVE';
    console.log(
      `  ${name.padEnd(11)} ${String(d.phase).padEnd(10)} ${String(d.sha ?? '?').slice(0, 7)}  ` +
        `${ok(settled)} settled  ${ok(carries)} carries the merge`,
    );
    if (!carries) {
      // THE LINE THIS SCRIPT EXISTS FOR.
      console.log(
        `              ⚠ DEPLOYED SHA DIFFERS FROM THE MERGE. Running ` +
          `${String(d.sha ?? '?').slice(0, 7)}, expected ${merge.sha.slice(0, 7)}. ` +
          `A green phase here means the OLD code is healthy.`,
      );
      problems++;
    }
    if (!settled) problems++;
  }
  console.log('');

  console.log(`MIGRATIONS — applied vs _journal.json (${journal} entries).`);
  console.log('             Never status:ok, which returns ok at 17 of 21 (F.139).');
  for (const [name, app] of Object.entries(APPS)) {
    const h = await health(app.health);
    if (!h.reachable) {
      console.log(`  ${name.padEnd(11)} unreachable: ${String(h.error).slice(0, 60)}`);
      problems++;
      continue;
    }
    if (h.withheld) {
      // Expected once F.176 lands and no HEALTH_TOKEN is set. NOT a failure.
      console.log(
        `  ${name.padEnd(11)} detail withheld (HTTP ${h.status}) — set HEALTH_TOKEN to compare`,
      );
      continue;
    }
    if (h.httpError) {
      console.log(`  ${name.padEnd(11)} HTTP ${h.httpError}`);
      problems++;
      continue;
    }
    if (h.applied === null) {
      console.log(`  ${name.padEnd(11)} status ${h.status} — no applied count in the response`);
      continue;
    }
    const inStep = h.applied === journal;
    console.log(
      `  ${name.padEnd(11)} applied ${String(h.applied).padStart(3)} / ${journal}  ` +
        `${ok(inStep)}  version ${h.version ?? '?'}`,
    );
    if (!inStep) {
      console.log(
        `              ⚠ ${journal - h.applied} MIGRATION(S) PENDING. deploy_on_push ships ` +
          `code and never schema (F.138) — apply per RUNBOOKS R17.`,
      );
      problems++;
    }
  }
  console.log('');

  const ci = ciChecks(merge.sha);
  console.log('CI on the merge commit');
  if (!ci) {
    console.log('  gh unavailable or no runs found');
  } else if (ci.length === 0) {
    console.log('  no runs for this commit');
  } else {
    for (const r of ci) {
      const good = r.conclusion === 'success' || r.conclusion === 'skipped';
      console.log(`  ${ok(good)} ${String(r.name).padEnd(20)} ${r.conclusion ?? r.status}`);
      if (!good && r.status === 'completed') problems++;
    }
  }
  console.log('');

  const delta = planDelta(merge.sha);
  console.log('PLAN delta from this merge');
  if (!delta) {
    console.log('  could not read the plan on both sides of the merge');
  } else {
    console.log(`  closed: ${delta.closed.join(', ') || 'none'}`);
    console.log(`  filed:  ${delta.filed.join(', ') || 'none'}`);
    console.log(`  ${delta.total} rows total`);
  }
  console.log('');

  console.log(problems === 0 ? 'No correspondence problems found.' : `${problems} problem(s) above.`);
  process.exit(problems === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
