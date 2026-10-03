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

/**
 * REFRESH `origin/main` BEFORE ANYTHING IS COMPARED AGAINST IT — F.180.
 *
 * ## THE FAILURE THAT WOULD HAVE SHIPPED IS THE QUIET ONE
 *
 * `origin/main` is a REMOTE-TRACKING REF. It is local data, and it only moves
 * when something fetches. This script never fetched, so it compared the live
 * deployed SHA against whatever the last `git fetch` or `git pull` happened to
 * leave behind.
 *
 * **A stale ref that happens to MATCH the deployed SHA produces a clean report
 * for the wrong reason — and nothing distinguishes it from a real pass.** That is
 * the ordinary case: the ref is stale, nothing has merged since it was last
 * fetched, so the deployed SHA equals the stale tip and every line reads `✓`. The
 * script says the deploys carry the latest merge while being structurally unable
 * to know whether a newer merge exists. For a tool whose ONLY job is
 * correspondence (F.173), that is the defect that matters.
 *
 * The loud half — a FALSE MISMATCH, warning that production runs the wrong SHA
 * when it does not — is how the bug was found (measured 2026-10-03: it claimed
 * production ran `c1748fe` where `153c0ad` was expected; `c1748fe` WAS the
 * merge). A false alarm gets investigated in five minutes. A false pass gets
 * believed.
 *
 * So the ref is fetched here, the before/after SHAs are PRINTED whether or not it
 * moved, and a fetch that fails does NOT fall back to the stale ref silently: the
 * report is marked UNVERIFIED and exits non-zero. "Cannot verify" and "verified
 * correct" must not look alike.
 */
function refreshOriginMain() {
  const read = () => {
    try {
      return sh('git', ['rev-parse', 'refs/remotes/origin/main']).trim();
    } catch {
      return null;
    }
  };
  const before = read();
  try {
    // Updates the remote-tracking ref only. No working tree, no local branch.
    sh('git', ['fetch', 'origin', 'main', '--quiet']);
  } catch (err) {
    return { ok: false, before, after: before, reason: String(err).split('\n')[0].slice(0, 90) };
  }
  const after = read();
  return { ok: true, before, after, moved: before !== after };
}

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
  const sha = d.services?.[0]?.source_commit_hash ?? d.workers?.[0]?.source_commit_hash ?? null;
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
/**
 * IN FLIGHT IS NOT THE SAME AS WRONG, and conflating them is the exact confusion
 * this script exists to remove.
 *
 * The first version printed '✗' for an `in_progress` check and counted a BUILDING
 * deploy as a "problem" — so running it straight after a merge always reported
 * failures that were simply not finished yet. A reader would learn to discount the
 * output, which is how a summary stops being read.
 */
const PENDING = '…';
const mark = (state) => (state === true ? '✓' : state === false ? '✗' : PENDING);

/** DO deploy phases that mean "not finished yet" rather than "wrong". */
const IN_FLIGHT = new Set(['BUILDING', 'DEPLOYING', 'PENDING_BUILD', 'PENDING_DEPLOY']);

async function main() {
  // F.180 — fetch BEFORE reading, and never compare against an unverified ref.
  const ref = refreshOriginMain();
  const merge = latestMergeOnMain();
  const journal = journalLength();
  let problems = 0;
  let inflight = 0;

  console.log('');
  if (ref.ok) {
    const where = ref.after ? ref.after.slice(0, 7) : '?';
    console.log(
      `REF  origin/main ${where} — fetched just now${
        ref.moved
          ? `, MOVED from ${ref.before ? ref.before.slice(0, 7) : 'nothing'}`
          : ', unchanged'
      }`,
    );
  } else {
    console.log(`REF  ⚠ COULD NOT FETCH origin/main — ${ref.reason}`);
    console.log('     Everything below is compared against a ref that may be BEHIND');
    console.log('     the real tip. A stale ref that happens to MATCH the deployed SHA');
    console.log('     reports a clean pass for the wrong reason, and nothing here can');
    console.log('     tell that apart from a real one.');
    console.log('     TREAT THIS REPORT AS UNVERIFIED, NOT AS GREEN.');
    problems++;
  }
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
    const inFlight = IN_FLIGHT.has(String(d.phase));
    // `null` means "not yet determined" and renders as '…', not as a failure.
    const settled = inFlight ? null : d.phase === 'ACTIVE';
    console.log(
      `  ${name.padEnd(11)} ${String(d.phase).padEnd(10)} ${String(d.sha ?? '?').slice(0, 7)}  ` +
        `${mark(settled)} settled  ${mark(carries)} carries the merge`,
    );
    if (inFlight) inflight++;
    if (!carries) {
      // THE LINE THIS SCRIPT EXISTS FOR.
      console.log(
        `              ⚠ DEPLOYED SHA DIFFERS FROM THE MERGE. Running ` +
          `${String(d.sha ?? '?').slice(0, 7)}, expected ${merge.sha.slice(0, 7)}. ` +
          `A green phase here means the OLD code is healthy.`,
      );
      problems++;
    }
    if (settled === false) problems++;
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
      const done = r.status === 'completed';
      const good = r.conclusion === 'success' || r.conclusion === 'skipped';
      console.log(
        `  ${mark(done ? good : null)} ${String(r.name).padEnd(20)} ${r.conclusion ?? r.status}`,
      );
      if (done && !good) problems++;
      if (!done) inflight++;
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

  if (!ref.ok) {
    console.log(
      `UNVERIFIED — origin/main could not be fetched, so the correspondence above ` +
        `is not evidence.${problems > 1 ? ` ${problems - 1} other problem(s) reported.` : ''}`,
    );
    process.exit(1);
  }
  if (problems > 0) {
    console.log(`${problems} problem(s) above.`);
  } else if (inflight > 0) {
    console.log(`No problems. ${inflight} thing(s) still in flight — re-run when they settle.`);
  } else {
    console.log('No correspondence problems found.');
  }
  // Exit 0 while things are merely unfinished: a non-zero exit for "not yet" would
  // make the script useless in the minutes after a merge, which is when it is run.
  process.exit(problems === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
