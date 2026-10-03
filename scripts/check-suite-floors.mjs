#!/usr/bin/env node
/**
 * `pnpm check:floors` — F.177. **A DROPPED TEST COUNT IS A RESULT.**
 *
 * ## THE DEFECT THIS EXISTS FOR
 *
 * Vitest exits 0 on a suite that collects FEWER tests than it did yesterday,
 * because nothing told it how many to expect. During F.173 a branch was cut from
 * `main` instead of from `f172-defect-view`, so nine tests were simply absent:
 * `pnpm test:scripts` reported **97 passed** where it had reported **106**, with
 * **zero failures**. The nine were not failing. They were missing, and the run
 * was green.
 *
 * It was caught by a human remembering a number from an earlier run, which is
 * the weakest possible detector (DEV.156). This is the detector that was absent.
 *
 * ## A FLOOR, NOT AN EXACT COUNT
 *
 * The check fails only when a suite collects FEWER tests than its recorded
 * minimum. Adding tests never breaks it; the floor is raised deliberately when a
 * suite grows. An exact count would turn every new test into a two-file change
 * and would be routed around within a week.
 *
 * It fails downward only, which is the direction that carries information.
 *
 * ## THE FLOORS ARE HAND-MAINTAINED, AND THAT IS THE KNOWN WEAKNESS
 *
 * `scripts/suite-floors.json` is a literal that the compiler cannot keep in step
 * with anything — the F.167 shape. It has ONE home and the owner is whoever edits
 * it, which is why this message tells you what to do rather than only that a
 * number is wrong: a gate whose failure is confusing gets disabled.
 *
 * ## HOW THE COUNTS GET HERE
 *
 * Each suite's `test` script now runs `--reporter=default --reporter=json`, so
 * the human output is unchanged and a machine-readable report lands beside it.
 * **No suite is run twice.** This script only reads those reports.
 *
 * A MISSING REPORT IS A FAILURE, not a skip. A suite that did not run is exactly
 * the thing being guarded against — F.166 is the sibling defect, where
 * `pnpm --filter <wrong-name>` exits 0 having run nothing.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FLOORS_FILE = path.join(ROOT, 'scripts/suite-floors.json');

const config = JSON.parse(fs.readFileSync(FLOORS_FILE, 'utf8'));
const suites = Object.entries(config.suites);

let failed = 0;
let missing = 0;
const rows = [];

for (const [name, suite] of suites) {
  const reportPath = path.join(ROOT, suite.report);
  let report;
  try {
    report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  } catch {
    rows.push({ name, floor: suite.floor, actual: null, state: 'NO REPORT' });
    missing++;
    continue;
  }
  const actual = report.numTotalTests;
  if (typeof actual !== 'number') {
    rows.push({ name, floor: suite.floor, actual: null, state: 'NO COUNT' });
    missing++;
    continue;
  }
  const state = actual < suite.floor ? 'BELOW FLOOR' : 'ok';
  if (state === 'BELOW FLOOR') failed++;
  rows.push({ name, floor: suite.floor, actual, state });
}

const pad = Math.max(...rows.map((r) => r.name.length));
console.log('');
console.log('SUITE COUNT FLOORS — a suite may grow; it may not silently shrink.');
for (const r of rows) {
  const mark = r.state === 'ok' ? '✓' : '✗';
  const got = r.actual === null ? '  ?' : String(r.actual).padStart(4);
  console.log(
    `  ${mark} ${r.name.padEnd(pad)}  ${got} tests  (floor ${String(r.floor).padStart(4)})` +
      (r.state === 'ok' ? '' : `  ← ${r.state}`),
  );
}
console.log('');

if (missing) {
  console.error(
    `✗ ${missing} suite(s) produced no JSON report. A suite that did not run is the ` +
      `exact failure this gate exists to catch (F.166, F.177).`,
  );
  console.error(`  Run \`pnpm test\` from the repo root, which runs every suite and writes them.`);
}
if (failed) {
  console.error(`✗ ${failed} suite(s) are BELOW their floor. Tests disappeared without failing.`);
  console.error('  Two things this is, in order of likelihood:');
  console.error('    1. A branch cut from the wrong parent, so some test files are absent.');
  console.error('       `git log --oneline origin/main..HEAD` and check what you built on.');
  console.error('    2. Test files deleted or renamed on purpose.');
  console.error(`       If so, LOWER the floor in scripts/suite-floors.json deliberately,`);
  console.error('       in the same commit as the deletion, and say why in the message.');
  console.error('  Do not lower a floor to get a build green. That is the whole point of it.');
}
if (missing || failed) process.exit(1);

console.log(`✓ all ${rows.length} suites at or above their floors.`);
