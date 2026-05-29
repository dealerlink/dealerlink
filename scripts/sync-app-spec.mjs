/**
 * DEV.64 — DigitalOcean App Platform spec sync (Stage D Day D.2).
 *
 * `.do/app.yaml` (staging) and `.do/app.production.yaml` (production) in this
 * repo are **documentation** — DO stores the live, deployed spec in its own
 * state. A push to `main` rebuilds the app from the latest commit but
 * against DO's stored spec; editing the committed YAML and pushing does NOT
 * change how the app is configured. DEV.64 documents this trap; this script
 * formalises the fix.
 *
 * The naive remedy — `doctl apps update <app-id> --spec .do/app.production.yaml`
 * — wipes every encrypted SECRET in the live spec, because the committed file
 * ships blank `type: SECRET` env entries (real values live ONLY in
 * `C:\Users\rohit\.dealerlink\<env>-secrets.txt` outside the repo). This
 * script does the safe variant: pulls the live spec, overlays the committed
 * non-secret fields onto it, and applies the merged result — preserving the
 * encrypted `EV[...]` value blobs for every SECRET.
 *
 * Operation:
 *   pnpm sync-spec:staging
 *   pnpm sync-spec:production
 *
 * Or directly:
 *   node scripts/sync-app-spec.mjs <staging|production> [--yes]
 *
 * Steps:
 *   1. doctl apps spec get $APP_ID → live YAML (encrypted EV[...] intact)
 *   2. yaml.parse both committed and live into JS objects
 *   3. Build merged object: structure from committed, secret `value` blobs
 *      pulled from live (matched by component type+name + env key). If a
 *      SECRET exists in committed but NOT in live, ABORT — we'd otherwise
 *      ship a blank into production.
 *   4. yaml.stringify merged; show diff against live with EV[...] redacted.
 *   5. Interactive confirmation prompt.
 *   6. doctl apps update $APP_ID --spec <merged-tempfile>
 *   7. Poll for ACTIVE (30s interval, 15-min cap).
 *
 * Notes / known constraints:
 *   - `doctl apps spec validate` rejects round-tripped specs ("secret env
 *     value must not be encrypted before app is created") — it validates
 *     against the new-app `/propose` path. Expected; `apps update` accepts
 *     the encrypted form on an existing app.
 *   - For brand-NEW app creation (no live spec yet), use
 *     `scripts/staging-app-render-spec.mjs` which injects raw values from
 *     the local secrets file. That code path is for `apps create`, not the
 *     existing-app update flow this script handles.
 *   - The committed yaml is the structural source of truth: anything that
 *     differs between committed and live becomes the merged value. The
 *     ONLY exception is each SECRET env's `value:` (encrypted, preserved
 *     from live).
 */
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

import yaml from 'yaml';

const TARGETS = {
  staging: {
    appId: '77edf06b-3273-479c-ae1c-15caca0db95b',
    appName: 'dealerlink-staging',
    committedSpec: '.do/app.yaml',
  },
  production: {
    appId: 'd8a25cb8-e4cb-4035-8413-6baab72398cd',
    appName: 'dealerlink-production',
    committedSpec: '.do/app.production.yaml',
  },
};

// ---------------------------------------------------------------------------
// args
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
const target = args[0];
const autoYes = args.includes('--yes') || args.includes('-y');

if (!target || !TARGETS[target]) {
  console.error('Usage: node scripts/sync-app-spec.mjs <staging|production> [--yes]');
  process.exit(2);
}

const { appId, appName, committedSpec } = TARGETS[target];

console.log(`→ syncing spec for ${appName} (${appId})`);
console.log(`  committed: ${committedSpec}`);

if (!fs.existsSync(committedSpec)) {
  console.error(`✗ committed spec file not found: ${committedSpec}`);
  process.exit(2);
}

// ---------------------------------------------------------------------------
// 1. fetch live spec
// ---------------------------------------------------------------------------
const tmpDir = os.tmpdir();
const livePath = path.join(tmpDir, `dl-spec-${target}-live.yaml`);
const mergedPath = path.join(tmpDir, `dl-spec-${target}-merged.yaml`);

console.log(`→ doctl apps spec get ${appId}`);
let liveYamlText;
try {
  liveYamlText = execFileSync('doctl', ['apps', 'spec', 'get', appId], {
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
  });
} catch (err) {
  console.error('✗ doctl failed:', err.stderr?.toString() || err.message);
  console.error('  ensure doctl is authenticated (doctl auth list)');
  process.exit(2);
}
fs.writeFileSync(livePath, liveYamlText, 'utf8');
console.log(`  wrote ${livePath} (${liveYamlText.length} bytes)`);

// ---------------------------------------------------------------------------
// 2. parse both specs
// ---------------------------------------------------------------------------
const committedSpecObj = yaml.parse(fs.readFileSync(committedSpec, 'utf8'));
const liveSpecObj = yaml.parse(liveYamlText);

// ---------------------------------------------------------------------------
// 3. build merged: LIVE base preserves DO-derived top-level keys (ingress,
//    alerts, features); COMMITTED overrides services/workers/databases/
//    domains structurally; SECRET env values are preserved from LIVE.
// ---------------------------------------------------------------------------

/**
 * Build a map of every env entry in the live spec keyed by
 * `<componentType>:<componentName>:<envKey>` → env object (whose .value
 * holds the encrypted EV[...] blob for SECRETs). componentType ∈
 * {services, workers}.
 */
function indexLiveEnvs(specObj) {
  const map = new Map();
  for (const componentType of ['services', 'workers']) {
    const list = specObj[componentType] ?? [];
    for (const component of list) {
      const compName = component.name;
      for (const env of component.envs ?? []) {
        map.set(`${componentType}:${compName}:${env.key}`, env);
      }
    }
  }
  return map;
}

const liveEnvIndex = indexLiveEnvs(liveSpecObj);
console.log(`→ live spec has ${liveEnvIndex.size} env entries across services + workers`);

// Start the merge from LIVE — this preserves DO-derived top-level keys
// (ingress, features, alerts) that the committed yaml doesn't declare and
// shouldn't blank. We'll then overlay the committed structure for the keys
// we DO control.
const merged = JSON.parse(JSON.stringify(liveSpecObj)); // deep clone of live

// Top-level overrides — committed wins.
for (const key of ['name', 'region']) {
  if (key in committedSpecObj) merged[key] = committedSpecObj[key];
}

// Lists we structurally own — committed replaces live entirely, EXCEPT:
//   - each SECRET env value is preserved from live (the only reason this
//     script exists).
const missing = [];
let injectedCount = 0;
let preservedCount = 0;

function mergeComponentList(componentType) {
  const committedList = committedSpecObj[componentType];
  if (!committedList) return;
  const mergedList = [];
  for (const committedComp of committedList) {
    // Start from the committed component (everything we control); then
    // walk its envs and, for any SECRET without a value, pull the encrypted
    // value out of the live env index.
    const out = JSON.parse(JSON.stringify(committedComp));
    for (const env of out.envs ?? []) {
      if (env.type !== 'SECRET') continue;
      if (Object.prototype.hasOwnProperty.call(env, 'value') && env.value) {
        preservedCount++;
        continue;
      }
      const liveEnv = liveEnvIndex.get(`${componentType}:${out.name}:${env.key}`);
      if (!liveEnv || !liveEnv.value) {
        missing.push(`${componentType}:${out.name}:${env.key}`);
        continue;
      }
      env.value = liveEnv.value;
      injectedCount++;
    }
    mergedList.push(out);
  }
  merged[componentType] = mergedList;
}

mergeComponentList('services');
mergeComponentList('workers');

// Databases + domains: committed wins entirely (no secret value semantics
// in either — only structural settings).
if (committedSpecObj.databases) merged.databases = committedSpecObj.databases;
if (committedSpecObj.domains) merged.domains = committedSpecObj.domains;

if (missing.length) {
  console.error('');
  console.error(
    `✗ aborting — ${missing.length} SECRET(s) in committed spec have no value in live spec:`,
  );
  for (const m of missing) console.error(`    · ${m}`);
  console.error('  refusing to ship blank secret(s) to the live app.');
  console.error('  options:');
  console.error(
    '    1. add the missing SECRET via the DO dashboard (Settings → App-Level Environment Variables)',
  );
  console.error('       then re-run this script — it will preserve the new live value.');
  console.error(
    '    2. run scripts/staging-app-render-spec.mjs to inject from the local secrets file',
  );
  console.error('       (use for net-new SECRETs declared in the committed yaml).');
  console.error("    3. remove the SECRET declaration from the committed yaml if it isn't needed.");
  process.exit(2);
}

console.log(
  `→ merge: injected ${injectedCount} live secret values; preserved ${preservedCount} committed values`,
);

// Style: match doctl's `apps spec get` output (flush-left list markers,
// alphabetized keys, no auto-wrap) so the diff is semantic-only noise-free.
const mergedYamlText = yaml.stringify(merged, {
  indent: 2,
  indentSeq: false, // list items flush-left, like doctl
  lineWidth: 0, // no auto-wrap of long EV[...] values
  sortMapEntries: true,
});
fs.writeFileSync(mergedPath, mergedYamlText, 'utf8');
console.log(`→ wrote merged spec: ${mergedPath}`);

// ---------------------------------------------------------------------------
// 4. diff (live → merged), redacting EV[...] values
// ---------------------------------------------------------------------------
function redact(text) {
  return text.replace(/(value:\s*)(EV\[[^\]]+\])/g, '$1EV[<redacted>]');
}

const liveRedactedPath = path.join(tmpDir, `dl-spec-${target}-live.redacted.yaml`);
const mergedRedactedPath = path.join(tmpDir, `dl-spec-${target}-merged.redacted.yaml`);
fs.writeFileSync(liveRedactedPath, redact(liveYamlText));
fs.writeFileSync(mergedRedactedPath, redact(mergedYamlText));

console.log('');
console.log('→ diff: live vs merged (EV[...] values redacted)');
const diff = spawnSync(
  'git',
  ['--no-pager', 'diff', '--no-index', '--color=always', liveRedactedPath, mergedRedactedPath],
  { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
);
// git diff returns exit 1 when there ARE differences — that's fine here.
const diffOut = diff.stdout || '';
if (diffOut.trim()) {
  process.stdout.write(diffOut);
} else {
  console.log('  (no semantic differences — committed spec already matches live)');
  console.log('  nothing to apply; exiting.');
  process.exit(0);
}

// ---------------------------------------------------------------------------
// 5. confirm
// ---------------------------------------------------------------------------
if (!autoYes) {
  console.log('');
  const rl = readline.createInterface({ input, output });
  const answer = (await rl.question(`Apply the merged spec to ${appName}? [y/N] `))
    .trim()
    .toLowerCase();
  rl.close();
  if (answer !== 'y' && answer !== 'yes') {
    console.log('aborted by operator');
    process.exit(0);
  }
} else {
  console.log('→ --yes supplied: applying without prompt');
}

// ---------------------------------------------------------------------------
// 6. apply
// ---------------------------------------------------------------------------
console.log('');
console.log(`→ doctl apps update ${appId} --spec ${mergedPath}`);
const update = spawnSync(
  'doctl',
  [
    'apps',
    'update',
    appId,
    '--spec',
    mergedPath,
    '--format',
    'ID,Spec.Name,ActiveDeployment.Phase',
  ],
  { encoding: 'utf8', stdio: 'inherit' },
);
if (update.status !== 0) {
  console.error(`✗ doctl apps update failed (exit ${update.status})`);
  process.exit(update.status ?? 1);
}

// ---------------------------------------------------------------------------
// 7. poll deployment until ACTIVE
// ---------------------------------------------------------------------------
console.log('');
console.log('→ polling deployment phase (30s interval, 15 min cap)…');
const deadline = Date.now() + 15 * 60 * 1000;
let lastPhase = '';
while (Date.now() < deadline) {
  const res = spawnSync(
    'doctl',
    ['apps', 'list-deployments', appId, '--format', 'Phase', '--no-header'],
    {
      encoding: 'utf8',
    },
  );
  const phase = (res.stdout || '').split('\n')[0]?.trim() ?? '';
  if (phase !== lastPhase) {
    console.log(`  ${new Date().toISOString()} — phase=${phase}`);
    lastPhase = phase;
  }
  if (phase === 'ACTIVE') {
    console.log('✓ deployment ACTIVE');
    process.exit(0);
  }
  if (phase === 'ERROR' || phase === 'FAILED' || phase === 'CANCELED') {
    console.error(`✗ deployment ended in ${phase}`);
    process.exit(1);
  }
  await new Promise((r) => setTimeout(r, 30_000));
}
console.error('✗ timed out waiting for deployment to reach ACTIVE');
process.exit(1);
