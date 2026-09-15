#!/usr/bin/env tsx
/**
 * sync-project-plan — render the WHOLE of PROJECT_PLAN.md from
 * `docs/stage-f-tasks.json` plus the committed header template at
 * `docs/project-plan-header.md`.
 *
 * Established Stage F Day 19 for the Stage F table; extended by F.37/F.63 to
 * own the entire document. PROJECT_PLAN.md is NEVER hand-edited — not the
 * table, not the heading, not the prose. Mark a task complete by editing the
 * JSON and running `pnpm plan:sync`. `pnpm plan:check` renders without
 * writing and exits 1 on any drift; it is wired into `pnpm verify` so a
 * stale file fails CI.
 *
 * WHY THE WHOLE FILE AND NOT A MARKED BLOCK (F.63): the file used to carry
 * Stage 0 and Stages A-E outside the markers, where `plan:sync` could not
 * write and the closeout rule forbade hand edits — so legitimate changes (a
 * stage retitle, a corrected citation, recording that Stage E never finished)
 * were impossible by any approved route. The narrative moved to
 * `docs/PROJECT_HISTORY.md`, which is hand-maintained and needs no rule.
 * What is left here is generated in its entirety, so "no hand edits at all"
 * is trivially satisfiable and there is no out-of-marker region to argue
 * about.
 *
 * The markers survive, and still mean something narrower:
 *
 *     <!-- STAGE_F_TASKS:START -->  …task tables…  <!-- STAGE_F_TASKS:END -->
 *
 * They delimit the part that comes from the JSON, so `plan:check` can tell
 * you WHICH half drifted — the task tables (edit the JSON) or the surrounding
 * prose (edit the template). Nothing outside them is authored content any
 * more; it is rendered from the template.
 *
 * Usage:
 *   pnpm plan:sync     # render + write
 *   pnpm plan:check    # render + diff only; exit 1 on mismatch
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as prettier from 'prettier';

export const MARKER_START = '<!-- STAGE_F_TASKS:START -->';
export const MARKER_END = '<!-- STAGE_F_TASKS:END -->';
export const SECTION_HEADING = '## Stage F — Phase 2';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Both paths are env-overridable so the test suite can drive the real CLI
 * against fixtures instead of the live plan. Production runs never set these.
 */
const TASKS_PATH =
  process.env.STAGE_F_TASKS_PATH ?? path.join(REPO_ROOT, 'docs', 'stage-f-tasks.json');
const PLAN_PATH = process.env.PROJECT_PLAN_PATH ?? path.join(REPO_ROOT, 'PROJECT_PLAN.md');
const HEADER_PATH =
  process.env.PROJECT_PLAN_HEADER_PATH ?? path.join(REPO_ROOT, 'docs', 'project-plan-header.md');

/**
 * PROJECT_PLAN.md "Status Legend" symbols and their meanings. Unknown status
 * is an error. The legend table in the rendered document is generated from
 * this map, so a new status cannot appear in the plan without a meaning.
 */
const STATUS_SYMBOLS: Record<string, string> = {
  complete: '✅',
  in_progress: '🔄',
  pending: '⏳',
  parked: '🅿️',
  deferred: '⏭️',
  blocked: '⚠️',
};

const STATUS_MEANINGS: Record<keyof typeof STATUS_SYMBOLS & string, string> = {
  complete: 'Done',
  in_progress: 'In progress',
  pending: 'Not started',
  parked: 'Parked (will resume later)',
  deferred: 'Deferred to a later phase',
  blocked: 'Blocked (needs decision or external dependency)',
};

export interface StageFTask {
  id: string;
  task: string;
  subPhase: string;
  days: string;
  status: string;
  completedDate: string | null;
  notes: string | null;
}

// ---------------------------------------------------------------------------
// Loading + validation
// ---------------------------------------------------------------------------

export function parseTasks(raw: string): StageFTask[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    // The bare SyntaxError names no file, and this one is always the JSON.
    throw new Error(
      `stage-f-tasks.json: not valid JSON — ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  const tasks = (parsed as { tasks?: unknown }).tasks;
  if (!Array.isArray(tasks) || tasks.length === 0) {
    throw new Error('stage-f-tasks.json: expected a non-empty "tasks" array');
  }

  const seen = new Set<string>();
  return tasks.map((t, i) => {
    if (t == null || typeof t !== 'object' || Array.isArray(t)) {
      throw new Error(`stage-f-tasks.json: task[${i}] is not an object`);
    }
    const task = t as Partial<StageFTask>;
    // completedDate and notes are typed `string | null` and were copied through
    // unchecked, so a number, boolean, array or object reached cell() and threw
    // a bare "value.replace is not a function" naming neither file nor field.
    for (const field of ['completedDate', 'notes'] as const) {
      const value = task[field];
      if (value != null && typeof value !== 'string') {
        throw new Error(
          `stage-f-tasks.json: task[${i}] (${String(task.id ?? 'no id')}) has a non-string ` +
            `"${field}" — expected a string or null, got ${typeof value}`,
        );
      }
    }
    for (const field of ['id', 'task', 'subPhase', 'days', 'status'] as const) {
      const value = task[field];
      if (typeof value !== 'string' || value === '') {
        throw new Error(`stage-f-tasks.json: task[${i}] is missing required string "${field}"`);
      }
    }
    const status = task.status as string;
    const id = task.id as string;
    // Object.hasOwn, NOT `in`: `in` walks the prototype chain, so a status of
    // "toString", "constructor", "__proto__" or "valueOf" passed validation and
    // rendered a native function into the Status cell — while being counted in
    // the total and appearing in no per-status summary row.
    if (!Object.hasOwn(STATUS_SYMBOLS, status)) {
      throw new Error(
        `stage-f-tasks.json: task ${id} has unknown status "${status}". ` +
          `Expected one of: ${Object.keys(STATUS_SYMBOLS).join(', ')}`,
      );
    }
    if (seen.has(id)) {
      throw new Error(`stage-f-tasks.json: duplicate task id "${id}"`);
    }
    seen.add(id);
    return {
      id,
      task: task.task as string,
      subPhase: task.subPhase as string,
      days: task.days as string,
      status,
      completedDate: task.completedDate ?? null,
      notes: task.notes ?? null,
    };
  });
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

/**
 * Escape a table cell.
 *
 *  - `|` would break the table.
 *  - Newlines would break the row.
 *  - `<!--` would open an HTML comment. Two reasons that matters: a note
 *    discussing the STAGE_F_TASKS markers would inject a SECOND marker pair
 *    into the rendered document — which used to abort the render with a
 *    "malformed markers" error blaming PROJECT_PLAN.md and prescribing a hand
 *    repair the settings deny — and any other comment in a note would vanish
 *    from the rendered table instead of being readable. Escaping the opener
 *    makes such text visible and inert. Notes in this repo do discuss the
 *    markers, so this is a live case, not a theoretical one.
 */
function cell(value: string | null): string {
  if (value == null || value === '') return '—';
  return sanitize(value)
    .replace(/\\/g, '\\\\') // FIRST, or a value's own \| becomes \\| — an escaped
    .replace(/\|/g, '\\|') //   backslash followed by a LIVE pipe, splitting the row
    .replace(/<!--/g, '&lt;!--')
    .trim();
}

/**
 * Collapse every control character to a space.
 *
 * `/\r?\n/` was not enough, and the way it failed is worth keeping:
 *
 *  - A LONE `\r` does not match it, and Prettier normalises `\r` to `\n`
 *    AFTER this guard runs — so the newline reappeared in the output, split the
 *    table row in two and emitted a bogus extra row, with `plan:check` staying
 *    green because the file genuinely equalled the render. Worse,
 *    `subPhase: 'x\r## Changelog'` put a REAL `## Changelog` heading into the
 *    generated document with sync and check both reporting success — a second
 *    route to the banned section, which `assertTemplateUsable()` cannot see
 *    because it inspects only the template.
 *  - A NUL in any field passed straight through into `PROJECT_PLAN.md`, making
 *    search tools classify the file as binary: bare `grep` then exits 1 with no
 *    output. That is the silent false negative of DEV.115 / DEV.117 / DEV.118,
 *    reintroduced into the very file F.63 had just cleaned of one.
 *
 * U+2028 and U+2029 are included because they are line terminators to a
 * JavaScript parser even though Markdown treats them as text.
 */
function sanitize(value: string): string {
  // Written as a code-point test rather than a character class: a regex
  // containing \x00-\x1f trips eslint's no-control-regex, and disabling that
  // rule to write the shorter version would be trading a real warning for
  // brevity.
  let out = '';
  for (const ch of value) {
    const code = ch.codePointAt(0) ?? 0;
    const isControl = code < 0x20 || code === 0x7f || code === 0x2028 || code === 0x2029;
    // An UNPAIRED SURROGATE is the worst of these because it does not corrupt
    // the output — it makes the output unreachable. writeFile with utf8
    // transcodes a lone \ud83d to U+FFFD, so the file on disk can never equal
    // the string it was compared against: plan:sync writes on every run and
    // plan:check is red forever, unsatisfiable by the one command meant to fix
    // it. That is the unsatisfiable-gate condition F.63 exists to remove
    // (DEV.112, DEV.130), recreated inside the generated file. JSON.stringify
    // emits one whenever a string carrying an emoji is sliced mid-pair.
    const isLoneSurrogate = code >= 0xd800 && code <= 0xdfff;
    out += isControl || isLoneSurrogate ? ' ' : ch;
  }
  return out;
}

/**
 * A sub-phase heading, mirroring Stage B's `### Week 1 — Foundation (Days 1–5)`.
 * The day range is DERIVED from the task rows, never hand-written.
 */
function subPhaseHeading(subPhase: string, tasks: StageFTask[]): string {
  // Heading text bypasses cell(), so neutralise the comment opener here too —
  // this is the one field that could still inject a marker into the output.
  const label = sanitize(subPhase).replace(/<!--/g, '&lt;!--').trim();
  const days = tasks
    .flatMap((t) => t.days.split(/[–-]/).map((d) => Number(d.trim())))
    .filter((n) => Number.isFinite(n));
  if (days.length === 0) return `### ${label}`;
  const lo = Math.min(...days);
  const hi = Math.max(...days);
  return lo === hi ? `### ${label} (Day ${lo})` : `### ${label} (Days ${lo}–${hi})`;
}

/**
 * Render the generated block: one section per sub-phase, each holding a table
 * in the SAME column format as the Stage B tables already in PROJECT_PLAN.md
 * (`# | Day | Deliverable | Status | Date | Notes`).
 */
export function renderBlock(tasks: StageFTask[]): string {
  const order: string[] = [];
  const groups = new Map<string, StageFTask[]>();
  for (const t of tasks) {
    let group = groups.get(t.subPhase);
    if (!group) {
      group = [];
      groups.set(t.subPhase, group);
      order.push(t.subPhase);
    }
    group.push(t);
  }

  const parts: string[] = [
    '<!-- Generated by scripts/sync-project-plan.ts from docs/stage-f-tasks.json.',
    '     Do not edit by hand — edit the JSON and run `pnpm plan:sync`. -->',
  ];

  for (const subPhase of order) {
    const rows = groups.get(subPhase) ?? [];
    parts.push('', subPhaseHeading(subPhase, rows), '');
    parts.push('| # | Day | Deliverable | Status | Date | Notes |');
    parts.push('| --- | --- | --- | --- | --- | --- |');
    for (const t of rows) {
      parts.push(
        `| ${cell(t.id)} | ${cell(t.days)} | ${cell(t.task)} | ${STATUS_SYMBOLS[t.status]} ` +
          `| ${cell(t.completedDate)} | ${cell(t.notes)} |`,
      );
    }
  }

  const done = tasks.filter((t) => t.status === 'complete').length;
  parts.push('', `**Stage F status: ${done}/${tasks.length} complete**`);

  return parts.join('\n');
}

/** Normalise the block with the repo's Prettier config so padding is stable. */
export async function formatBlock(block: string): Promise<string> {
  // Resolve against the repo's own plan file, not PLAN_PATH — under test the
  // latter points at a fixture outside the repo, where the config is absent.
  const config = await prettier.resolveConfig(path.join(REPO_ROOT, 'PROJECT_PLAN.md'));
  const formatted = await prettier.format(block, {
    ...config,
    // The tailwind plugin is irrelevant to markdown; loading it here only
    // risks a parser resolution failure.
    plugins: [],
    parser: 'markdown',
  });
  return formatted.trimEnd();
}

// ---------------------------------------------------------------------------
// Marker handling
// ---------------------------------------------------------------------------

export interface MarkerPosition {
  start: number;
  end: number;
}

function countOccurrences(haystack: string, needle: string): number {
  let count = 0;
  let idx = haystack.indexOf(needle);
  while (idx !== -1) {
    count++;
    idx = haystack.indexOf(needle, idx + needle.length);
  }
  return count;
}

/**
 * Locate the marker pair, refusing anything malformed: duplicated markers
 * (which is what a nested block looks like), a lone marker, or END before
 * START. Returns null when neither marker is present (first run).
 */
export function findMarkers(plan: string): MarkerPosition | null {
  const starts = countOccurrences(plan, MARKER_START);
  const ends = countOccurrences(plan, MARKER_END);

  if (starts === 0 && ends === 0) return null;

  if (starts !== 1 || ends !== 1) {
    throw new Error(
      `PROJECT_PLAN.md: malformed markers — found ${starts} x START and ${ends} x END. ` +
        'Exactly one of each is required; duplicated markers are how a nested block ' +
        'presents, and a lone marker cannot be spliced safely. Repair the file by ' +
        'hand before running plan:sync.',
    );
  }

  const start = plan.indexOf(MARKER_START);
  const end = plan.indexOf(MARKER_END);
  if (end < start) {
    throw new Error(
      'PROJECT_PLAN.md: malformed markers — STAGE_F_TASKS:END appears before ' +
        'STAGE_F_TASKS:START. Repair the file by hand before running plan:sync.',
    );
  }
  return { start, end };
}

/**
 * Everything outside the marker block, with a sentinel standing in for the
 * generated task tables.
 *
 * The sentinel is a PRINTABLE token. It used to be a literal NUL, which made
 * every search tool classify this file as binary: the Claude Code `grep` shim
 * exited 1 with no output on it, `rg` listed no lines without `-a`, and GNU
 * grep printed "binary file matches" — a silent false negative in a repo whose
 * conclusions lean on negative greps (DEV.115, DEV.117, DEV.118, F.65). The
 * value is only ever compared against itself, before versus after, so any
 * improbable non-NUL string does the same job.
 *
 * Used by `plan:check` to say WHICH half of the document drifted rather than
 * just that it did.
 */
export const BLOCK_SENTINEL = '<<<STAGE_F_TASKS_BLOCK>>>';

export function outsideMarkers(plan: string): string {
  const pos = findMarkers(plan);
  if (!pos) return plan;
  return `${plan.slice(0, pos.start)}${BLOCK_SENTINEL}${plan.slice(pos.end + MARKER_END.length)}`;
}

/**
 * The inverse: just the marker block, or null when the document has none.
 */
export function insideMarkers(plan: string): string | null {
  const pos = findMarkers(plan);
  if (!pos) return null;
  return plan.slice(pos.start, pos.end + MARKER_END.length);
}

// ---------------------------------------------------------------------------
// Whole-document rendering
// ---------------------------------------------------------------------------

/** The Status Legend table, generated so a new status cannot slip in unlabelled. */
function renderLegend(): string {
  const rows = Object.entries(STATUS_SYMBOLS).map(
    ([status, symbol]) => `| ${symbol} | ${STATUS_MEANINGS[status] ?? status} |`,
  );
  return ['## Status Legend', '', '| Symbol | Meaning |', '| --- | --- |', ...rows].join('\n');
}

/** A one-line count per status, so the plan reports its own shape. */
function renderSummary(tasks: StageFTask[]): string {
  const counts = new Map<string, number>();
  for (const t of tasks) counts.set(t.status, (counts.get(t.status) ?? 0) + 1);
  const rows = Object.keys(STATUS_SYMBOLS)
    .filter((status) => counts.has(status))
    .map(
      (status) =>
        `| ${STATUS_SYMBOLS[status]} ${STATUS_MEANINGS[status] ?? status} | ${counts.get(status)} |`,
    );
  return [
    '## Stage F Progress',
    '',
    '| Status | Tasks |',
    '| --- | --- |',
    ...rows,
    `| **Total** | **${tasks.length}** |`,
  ].join('\n');
}

/**
 * How the banned section can be spelled. "Change Log" and "Change-Log" are the
 * same section under DEV.110's ban, and an HTML heading is a heading.
 */
const CHANGELOG_NAME_BODY = 'Change[\\s\\u00a0\\u00ad\\u200b\\u202f\\u2000-\\u200a\\u3000-]*Log\\b';

/** Changelog heading matchers, in every form Markdown and HTML allow. */
function changelogHeadings(): RegExp[] {
  return [
    new RegExp('^ {0,3}#{1,6}[ \\t]+' + CHANGELOG_NAME_BODY, 'im'),
    new RegExp('^ {0,3}' + CHANGELOG_NAME_BODY + '[ \\t]*\\n {0,3}[=-]+[ \\t]*$', 'im'),
    new RegExp('<h[1-6][^>]*>\\s*' + CHANGELOG_NAME_BODY, 'i'),
  ];
}

/**
 * Invariants of the RENDERED document, checked before it is written.
 *
 * Guarding each input path separately is what kept failing: escaping `<!--`
 * closed the marker route through the JSON and left control characters open;
 * `assertTemplateUsable()` closed the Changelog route through the template and
 * left the JSON open — `subPhase: 'x\\r## Changelog'` planted a real heading
 * with `plan:check` reporting "in sync". These are properties of the OUTPUT, so
 * they are checked there, once, and hold for any route including ones not yet
 * thought of. The message names both sources, because the output cannot say
 * which one it came from.
 */
export function assertRenderedOk(rendered: string): void {
  const sources = 'Check docs/project-plan-header.md and docs/stage-f-tasks.json.';
  if (changelogHeadings().some((re) => re.test(rendered))) {
    throw new Error(
      'REFUSING TO WRITE: the rendered document contains a Changelog heading. ' +
        'That section was deleted on Day 24 (DEV.110) and must not return. ' +
        sources,
    );
  }
  // The highest-consequence invariant, and the one the input-path guard alone
  // could not protect: a lone surrogate survives a utf8 round-trip as U+FFFD,
  // so the file on disk can never equal this string — plan:sync writes forever
  // and plan:check can never be satisfied. sanitize() closes the routes that
  // exist today; this closes the class, including a future field that skips it.
  if (Buffer.from(rendered, 'utf8').toString('utf8') !== rendered) {
    throw new Error(
      'REFUSING TO WRITE: the rendered document does not survive a utf8 ' +
        'round-trip, so the written file could never equal it and plan:check ' +
        'would be unsatisfiable. A field almost certainly holds an unpaired ' +
        'surrogate. ' +
        sources,
    );
  }

  const malformed = malformedTableRows(rendered);
  if (malformed.length > 0) {
    throw new Error(
      'REFUSING TO WRITE: the rendered document has ' +
        malformed.length +
        ' malformed table row(s), first at line ' +
        malformed[0] +
        '. A cell value probably carries an unescaped delimiter. ' +
        sources,
    );
  }
}

/**
 * Line numbers of table rows whose delimiter count differs from their header's.
 *
 * Escape-aware: an escaped pipe inside a cell is content, not a delimiter.
 * Counting raw pipe characters reports false positives on any note quoting a
 * regex — which is how one attempt at this check "found" a defect that was not
 * there.
 */
export function malformedTableRows(markdown: string): number[] {
  const lines = markdown.split('\n');
  const isSeparator = (l: string | undefined): boolean => l != null && /^\|[\s|:-]+\|?\s*$/.test(l);
  const delimiters = (line: string): number => {
    let count = 0;
    for (let i = 0; i < line.length; i++) {
      if (line[i] !== '|') continue;
      let backslashes = 0;
      for (let k = i - 1; k >= 0 && line[k] === '\\'; k--) backslashes++;
      if (backslashes % 2 === 0) count++;
    }
    return count;
  };
  const bad: number[] = [];
  let expected: number | null = null;
  lines.forEach((line, i) => {
    if (!/^\|/.test(line)) {
      if (line.trim() !== '') expected = null;
      return;
    }
    if (isSeparator(lines[i + 1])) {
      expected = delimiters(line);
      return;
    }
    if (isSeparator(line)) return;
    if (expected != null && delimiters(line) !== expected) bad.push(i + 1);
  });
  return bad;
}
/**
 * Reject a header template that would corrupt the rendered document.
 *
 * Both of these were live holes before F.63's closeout review found them:
 *
 *  - A `Changelog` heading in the template renders straight through into
 *    PROJECT_PLAN.md and `plan:check` reports "in sync", because the file DOES
 *    equal the render. The section was deleted on Day 24 (DEV.110) and must
 *    not return, so the ban is enforced at the source it could now come from.
 *    Covers ATX with up to 3 leading spaces and setext with a one-character
 *    underline, both of which are valid CommonMark headings that a naive
 *    `/^#+ Changelog/` misses. Prettier would normalise either into a visible
 *    heading in the output, so the test-suite assertion on the rendered plan is
 *    a second line of defence rather than the only one.
 *  - A marker in the template puts TWO marker pairs in the output. Nothing
 *    downstream notices while the file is in sync, and the next genuine drift
 *    then aborts with "malformed markers" instead of anything useful.
 */
export function assertTemplateUsable(header: string): void {
  if (changelogHeadings().some((re) => re.test(header))) {
    throw new Error(
      'REFUSING TO RENDER: the header template contains a Changelog heading. ' +
        'That section was deleted on Day 24 (DEV.110) and must not return — ' +
        'docs/stage-f-tasks.json already carries completedDate and notes per task.',
    );
  }
  if (header.includes(MARKER_START) || header.includes(MARKER_END)) {
    throw new Error(
      'REFUSING TO RENDER: the header template contains a STAGE_F_TASKS marker. ' +
        'The markers are emitted by the renderer; a second pair in the output makes ' +
        'the task block unlocatable.',
    );
  }
}

/**
 * Render the entire document: committed header template, generated legend,
 * the marker-delimited task tables, and a generated summary. No part of the
 * output is authored in PROJECT_PLAN.md itself.
 */
export function renderPlan(header: string, tasks: StageFTask[]): string {
  assertTemplateUsable(header);
  return [
    '<!-- GENERATED FILE — DO NOT EDIT.',
    '     Every line of PROJECT_PLAN.md is rendered by scripts/sync-project-plan.ts',
    '     from docs/stage-f-tasks.json and docs/project-plan-header.md.',
    '     Edit those, then run `pnpm plan:sync`. Hand edits are overwritten and',
    '     fail `pnpm plan:check` in CI. Stages 0-E live in docs/PROJECT_HISTORY.md. -->',
    '',
    header.trim(),
    '',
    '---',
    '',
    renderLegend(),
    '',
    '---',
    '',
    SECTION_HEADING,
    '',
    MARKER_START,
    renderBlock(tasks),
    MARKER_END,
    '',
    '---',
    '',
    renderSummary(tasks),
    '',
    '---',
    '',
    '_This plan is generated. For what is already done, see `docs/PROJECT_HISTORY.md`._',
    '',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

export interface RunResult {
  changed: boolean;
  taskCount: number;
}

/** Where the drift is, so the failure message can name the file to edit. */
function describeDrift(current: string, next: string): string {
  // The region split needs well-formed markers in the ON-DISK file to mean
  // anything, and findMarkers throws when they are duplicated, orphaned or
  // inverted. That is no longer a state anyone has to repair: the file is
  // generated, so `plan:sync` regenerates it whatever is in it. Say that,
  // instead of surfacing a marker error whose old remedy was a hand edit the
  // settings now deny.
  let outsideChanged: boolean;
  let insideChanged: boolean;
  try {
    outsideChanged = outsideMarkers(current) !== outsideMarkers(next);
    insideChanged = insideMarkers(current) !== insideMarkers(next);
  } catch {
    return (
      'The file on disk is corrupt or hand-edited beyond recognition ' +
      '(its STAGE_F_TASKS markers are duplicated, orphaned or inverted). ' +
      'Nothing needs repairing by hand — `pnpm plan:sync` regenerates the whole file.'
    );
  }
  if (insideChanged && !outsideChanged) {
    return 'The task tables drifted — edit docs/stage-f-tasks.json.';
  }
  if (outsideChanged && !insideChanged) {
    return 'The surrounding prose drifted — edit docs/project-plan-header.md.';
  }
  if (findMarkers(current) == null) {
    return 'PROJECT_PLAN.md has no STAGE_F_TASKS markers — it will be rendered from scratch.';
  }
  return 'Both the task tables and the surrounding prose drifted.';
}

export async function run(argv: string[]): Promise<RunResult> {
  const check = argv.includes('--check');

  const tasks = parseTasks(await readFile(TASKS_PATH, 'utf8'));
  const header = await readFile(HEADER_PATH, 'utf8');
  // One canonical form for the whole document, used for the comparison, the
  // write and the drift message alike. Building it once is what keeps the
  // three from disagreeing: comparing a trimmed render against an on-disk file
  // that ends in a newline reports the trailing byte as prose drift.
  const next = `${(await formatBlock(renderPlan(header, tasks))).trimEnd()}\n`;
  // findMarkers throws on a duplicated, orphaned or inverted pair. Calling it
  // on the OUTPUT is what makes that guard cover the committed file: the
  // comparison and write paths below never look at the markers themselves.
  if (findMarkers(next) == null) {
    throw new Error('REFUSING TO RENDER: the rendered document has no STAGE_F_TASKS markers.');
  }
  assertRenderedOk(next);
  const current = await readFile(PLAN_PATH, 'utf8').catch(() => '');
  const changed = next !== current;

  if (check) {
    if (changed) {
      console.error(
        'FAIL: PROJECT_PLAN.md is out of date.\n' +
          `  ${describeDrift(current, next)}\n` +
          '  Run `pnpm plan:sync` to regenerate it. PROJECT_PLAN.md is never hand-edited.',
      );
      process.exitCode = 1;
    } else {
      console.log(`OK: PROJECT_PLAN.md is in sync (${tasks.length} tasks).`);
    }
    return { changed, taskCount: tasks.length };
  }

  if (changed) {
    await writeFile(PLAN_PATH, next, 'utf8');
    console.log(`OK: Rendered PROJECT_PLAN.md (${tasks.length} tasks).`);
  } else {
    console.log(`OK: PROJECT_PLAN.md already in sync (${tasks.length} tasks) — no write.`);
  }
  return { changed, taskCount: tasks.length };
}

const invokedPath = process.argv[1];
const isMain =
  invokedPath != null && path.resolve(invokedPath) === path.resolve(fileURLToPath(import.meta.url));

if (isMain) {
  run(process.argv.slice(2)).catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
