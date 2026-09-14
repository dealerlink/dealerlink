#!/usr/bin/env node
/**
 * Dangling-reference check for DEV and ADR ids.
 *
 * C6a in docs/BUILD_PROMPT_TEMPLATE.md catches a DUPLICATE id at the moment it
 * is written. This catches the inverse at read time: a citation that resolves to
 * nothing. The two together close the id problem from both ends.
 *
 * Why this matters more than tidiness: these ids are how the project's reasoning
 * is cross-referenced. A citation pointing at a missing entry sends the next
 * reader looking for a decision record that does not exist, and — worse — the
 * wrong id propagates. DEV.38 was cited in a daily prompt, and from there into
 * TYPST_SPIKE.md, F38_TYPST_PLAN.md and PROJECT_PLAN.md, none of which could be
 * checked against anything.
 *
 * Usage:  node scripts/check-id-references.mjs          # report, exit 1 if dangling
 *         node scripts/check-id-references.mjs --list   # also list every id defined
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const DEV_FILE = 'DEVIATIONS.md';
const ADR_FILE = 'DECISIONS.md';
const ALLOWLIST_FILE = 'scripts/id-reference-allowlist.json';

/**
 * Deliberate exceptions, scoped by (id, file) and each carrying a reason.
 *
 * Prose sometimes must name a missing id — to explain that it is missing, or
 * because the file is a verbatim archive of what a prompt said and editing it
 * would rewrite the record. Scoped by file rather than file:line so the
 * allowlist is not invalidated by an edit above the citation.
 */
function allowed() {
  const { allow } = JSON.parse(readFileSync(ALLOWLIST_FILE, 'utf8'));
  const set = new Set();
  const deferred = [];
  for (const entry of allow) {
    if (!entry.reason?.trim()) {
      throw new Error(`${ALLOWLIST_FILE}: ${entry.id} in ${entry.file} has no reason`);
    }
    // A reason alone is not enough. The verifier's critique of the first
    // version of this file was exact: requiring a reason never requires the
    // reason to be VALID, so an allowlist can quietly convert real errors
    // into permitted ones. `kind` forces the distinction to be stated.
    if (entry.kind !== 'deliberate-mention' && entry.kind !== 'deferred-fix') {
      throw new Error(
        `${ALLOWLIST_FILE}: ${entry.id} in ${entry.file} needs a kind — ` +
          "'deliberate-mention' (the id is named in order to say it is missing, or " +
          "the file is a verbatim archive) or 'deferred-fix' (the citation is " +
          "genuinely wrong and blocked on something outside this file).",
      );
    }
    if (entry.kind === 'deferred-fix') {
      if (!entry.tracked?.trim()) {
        throw new Error(
          `${ALLOWLIST_FILE}: ${entry.id} in ${entry.file} is a deferred-fix and needs ` +
            "a `tracked` task id. A known-wrong citation with no owner becomes permanent.",
        );
      }
      deferred.push(entry);
    }
    set.add(`${entry.id}@${entry.file}`);
  }
  return { set, deferred };
}

/** Deferred fixes are printed on EVERY run, pass or fail — they are suppressed
 * so the check can run, not because they are correct. */
function reportDeferred(deferred) {
  if (deferred.length === 0) return;
  console.log(
    `\nKNOWN-WRONG CITATIONS, deferred (${deferred.length}) — these are NOT deliberate mentions:`,
  );
  for (const d of deferred) console.log(`  ${d.id} in ${d.file} — tracked as ${d.tracked}`);
}


/** Ids that actually have an entry — an `## DEV.n` / `## ADR-n` heading. */
function defined() {
  const devs = new Set(
    [...readFileSync(DEV_FILE, 'utf8').matchAll(/^## DEV\.(\d+)/gm)].map((m) => `DEV.${m[1]}`),
  );
  const adrs = new Set(
    [...readFileSync(ADR_FILE, 'utf8').matchAll(/^## ADR-(\d+)/gm)].map((m) => `ADR-${m[1]}`),
  );
  return { devs, adrs };
}

/**
 * Every citation in tracked text files. Uses `git ls-files` rather than a
 * directory walk so node_modules, build output and untracked scratch cannot
 * contribute phantom citations.
 */
function citations() {
  const files = execFileSync('git', ['ls-files'], { encoding: 'utf8' })
    .split('\n')
    .filter((f) => /\.(md|ts|tsx|mjs|js|json|yml|yaml|sql|typ)$/.test(f));

  const found = new Map(); // id -> Set("file:line")
  for (const file of files) {
    let text;
    try {
      text = readFileSync(file, 'utf8');
    } catch {
      continue; // binary or unreadable — not a citation source
    }
    text.split('\n').forEach((line, i) => {
      for (const m of line.matchAll(/\b(DEV\.\d+|ADR-\d+)\b/g)) {
        const id = m[1];
        if (!found.has(id)) found.set(id, new Set());
        found.get(id).add(`${file}:${i + 1}`);
      }
    });
  }
  return found;
}

const { devs, adrs } = defined();
const cited = citations();

const { set: allow, deferred } = allowed();

/** A citation is dangling if the id has no entry AND the site is not allowlisted. */
const dangling = [...cited.entries()]
  .map(([id, where]) => [
    id,
    new Set([...where].filter((w) => !allow.has(`${id}@${w.split(':')[0]}`))),
  ])
  .filter(([id, where]) => where.size > 0 && (id.startsWith('DEV.') ? !devs.has(id) : !adrs.has(id)))
  .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }));

if (process.argv.includes('--list')) {
  console.log(`defined: ${devs.size} DEV entries, ${adrs.size} ADRs`);
  console.log(`allowlisted exceptions: ${allow.size}`);
}

if (dangling.length === 0) {
  console.log(`OK: every cited id resolves (${cited.size} distinct ids cited).`);
  reportDeferred(deferred);
  process.exit(0);
}

console.error(`DANGLING: ${dangling.length} cited id(s) have no entry.\n`);
for (const [id, where] of dangling) {
  console.error(`  ${id} — cited in ${where.size} place(s):`);
  for (const w of [...where].sort()) console.error(`      ${w}`);
}
reportDeferred(deferred);
console.error(
  '\nDo NOT fix this by writing entries for the missing ids — that fabricates a\n' +
    'record of decisions nobody made. Correct the citations to the id that was\n' +
    'meant, and where a citation cannot be resolved, say so in place.',
);
process.exit(1);
