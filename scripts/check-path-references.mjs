#!/usr/bin/env node
/**
 * check-path-references — every `docs/…` path cited anywhere must resolve to a
 * file that exists.
 *
 * THE INVERSE OF `check:ids`, and the gap that check left open. `check:ids`
 * validates that a cited DEV/ADR id has an entry; nothing validated that a
 * cited PATH has a file. The two failure modes are the same shape — a
 * cross-reference that silently stopped resolving — and the second is likelier
 * during a docs restructure, because `git mv` moves the file and leaves every
 * citation of it behind.
 *
 * Not hypothetical: `docs/DOC_AUDIT_2026-09-08.md:158` recorded that
 * `README.md` cites `docs/DECISIONS.md` when the file is at the repo root. The
 * audit found it on 2026-09-08 and it was still there when this check was
 * written, because nothing re-checked it.
 *
 * WHAT COUNTS AS A CITATION: `docs/` followed by a path WITH A FILE EXTENSION,
 * optionally inside backticks or quotes so names containing spaces are caught
 * (`docs/3 PO Premier.pdf`). The extension requirement keeps prose ("push
 * docs/materials") and git branch names ("docs/dev-103-merge-gate") out of the
 * results — both produced false positives in a first pass.
 *
 * Allowlisted sites carry a `reason` and a `kind`:
 *   - `deliberate-mention`  — the text names a path in order to say it moved or
 *     does not exist. Removing the mention would destroy the record.
 *   - `planned-deliverable` — the path is what a PENDING task will create. The
 *     entry must name that task, and the checker verifies the task is not yet
 *     complete, so the allowance expires on its own instead of rotting.
 *
 * MUTUAL COVERAGE WITH `check:ids` — READ THIS BEFORE SIMPLIFYING EITHER.
 * The two checks cover each other, and the coupling is deliberate rather than
 * accidental:
 *
 *   - this check reads PATH citations, including the ones inside
 *     `scripts/id-reference-allowlist.json`'s reasons;
 *   - `check:ids` reads ID citations, including the ones inside THIS check's
 *     allowlist reasons.
 *
 * So a decorative cross-reference in either allowlist is caught by the other.
 * That is not theoretical: the reason field covering this file's own docblock
 * originally read "Mirrors the DEV.38 entry for check-id-references.mjs", and
 * `check:ids` rejected it on the spot — DEV.38 deliberately has no entry. The
 * citation was dropped rather than the id allowlist grown.
 *
 * The consequence for anyone refactoring: if one check is narrowed to stop
 * scanning the other's files, or either allowlist is moved outside the scanned
 * set, the pair silently stops covering each other's prose. Nothing will fail
 * to announce it. Keep both allowlists inside both scans.
 *
 * Usage: pnpm check:paths
 */
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const ALLOWLIST_FILE = 'scripts/path-reference-allowlist.json';
const TASKS_FILE = 'docs/stage-f-tasks.json';

const SEARCHABLE = /\.(md|json|ts|tsx|mjs|js|yml|yaml)$/;

/** Every tracked file — the set to SCAN. Existence is checked on disk instead. */
function trackedFiles() {
  return execSync('git ls-files', { encoding: 'utf8' }).trim().split('\n');
}

function allowed() {
  const raw = JSON.parse(readFileSync(ALLOWLIST_FILE, 'utf8'));
  const set = new Map();
  for (const entry of raw.allow) {
    if (!entry.reason || !entry.kind) {
      console.error(
        `${ALLOWLIST_FILE}: the entry for ${entry.path} in ${entry.file} needs both ` +
          'a "reason" and a "kind" (deliberate-mention | planned-deliverable).',
      );
      process.exit(1);
    }
    if (entry.kind === 'planned-deliverable' && !entry.task) {
      console.error(
        `${ALLOWLIST_FILE}: ${entry.path} is kind "planned-deliverable" and must name the ` +
          '"task" that will create it, so the allowance can expire.',
      );
      process.exit(1);
    }
    set.set(`${entry.path} ${entry.file}`, entry);
  }
  return set;
}

/**
 * A `planned-deliverable` allowance is only valid while its task is open. Once
 * the task is complete the file should exist, and the allowance is a lie.
 */
function expiredAllowances(allow) {
  const tasks = JSON.parse(readFileSync(TASKS_FILE, 'utf8')).tasks;
  const expired = [];
  for (const entry of allow.values()) {
    if (entry.kind !== 'planned-deliverable') continue;
    const task = tasks.find((t) => t.id === entry.task);
    if (!task) {
      expired.push(`${entry.path} names task ${entry.task}, which does not exist`);
    } else if (task.status === 'complete') {
      expired.push(
        `${entry.path} is allowed until ${entry.task} ships, but ${entry.task} is complete — ` +
          'the file should exist now',
      );
    }
  }
  return expired;
}

/** Cited paths mapped to the sites citing them. */
function citations(files) {
  // Quoted/backticked first so names with spaces survive; then bare tokens.
  const patterns = [
    /[`'"](docs\/[^`'"\n]*?\.[A-Za-z0-9]{1,5})[`'"]/g,
    /(?<![\w/.-])(docs\/[A-Za-z0-9._/-]*\.[A-Za-z0-9]{1,5})/g,
  ];
  const cited = new Map();
  for (const file of files) {
    if (!SEARCHABLE.test(file)) continue;
    let text;
    try {
      text = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    text.split('\n').forEach((line, i) => {
      for (const re of patterns) {
        for (const m of line.matchAll(re)) {
          const path = m[1].replace(/[.,;:)\]}]+$/, '');
          // Globs are patterns, not citations: `docs/*.md` and
          // `docs/pdf-references/*.pdf` both appear in prose describing a set
          // of files, and neither names a file that should exist.
          if (/[*?[\]]/.test(path)) continue;
          if (!cited.has(path)) cited.set(path, new Set());
          cited.get(path).add(`${file}:${i + 1}`);
        }
      }
    });
  }
  return cited;
}

const files = trackedFiles();
const cited = citations(files);
const allow = allowed();

/**
 * Existence is a FILESYSTEM question, not a git-index one.
 *
 * A first version was `tracked.has(p) || existsSync(p)`, and it was vacuous in
 * the exact case this check exists for: move a cited file without staging the
 * move and `git ls-files` still reports the old path, so the check passed while
 * every citation of it was already broken. Caught by moving docs/TESTING.md and
 * watching the check stay green.
 */
const exists = (p) => existsSync(p);

const dangling = [...cited.entries()]
  .filter(([path]) => !exists(path))
  .map(([path, sites]) => [
    path,
    [...sites].filter((site) => !allow.has(`${path} ${site.slice(0, site.lastIndexOf(':'))}`)),
  ])
  .filter(([, sites]) => sites.length > 0);

const expired = expiredAllowances(allow);

if (dangling.length === 0 && expired.length === 0) {
  console.log(`OK: every cited docs/ path resolves (${cited.size} distinct paths cited).`);
  // Grouped by PATH, not by site: three citations of one unwritten file is one
  // planned deliverable, and printing it three times reads like three.
  const planned = new Map();
  for (const e of allow.values()) {
    if (e.kind === 'planned-deliverable') planned.set(e.path, e.task);
  }
  if (planned.size > 0) {
    console.log(
      `\nPLANNED DELIVERABLES, not yet written (${planned.size}) — allowed until their task ships:`,
    );
    for (const [path, task] of planned) console.log(`  ${path} — ${task}`);
  }
  process.exit(0);
}

if (dangling.length > 0) {
  console.error(`DANGLING: ${dangling.length} cited docs/ path(s) do not exist.\n`);
  for (const [path, sites] of dangling) {
    console.error(`  ${path} — cited in ${sites.length} place(s):`);
    for (const site of sites) console.error(`      ${site}`);
  }
  console.error(
    '\nFix the CITATION; do not create an empty file to satisfy it. If a path moved,\n' +
      'update every citation in the same commit as the move. If the mention is\n' +
      'deliberate — naming a path to say it moved or never existed — add it to\n' +
      `${ALLOWLIST_FILE} with a reason.`,
  );
}

for (const message of expired) console.error(`\nEXPIRED ALLOWANCE: ${message}`);

process.exit(1);
