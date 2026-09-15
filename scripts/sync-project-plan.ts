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
    const task = t as Partial<StageFTask>;
    for (const field of ['id', 'task', 'subPhase', 'days', 'status'] as const) {
      const value = task[field];
      if (typeof value !== 'string' || value === '') {
        throw new Error(`stage-f-tasks.json: task[${i}] is missing required string "${field}"`);
      }
    }
    const status = task.status as string;
    const id = task.id as string;
    if (!(status in STATUS_SYMBOLS)) {
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
  return value.replace(/\|/g, '\\|').replace(/<!--/g, '&lt;!--').replace(/\r?\n/g, ' ').trim();
}

/**
 * A sub-phase heading, mirroring Stage B's `### Week 1 — Foundation (Days 1–5)`.
 * The day range is DERIVED from the task rows, never hand-written.
 */
function subPhaseHeading(subPhase: string, tasks: StageFTask[]): string {
  // Heading text bypasses cell(), so neutralise the comment opener here too —
  // this is the one field that could still inject a marker into the output.
  const label = subPhase.replace(/<!--/g, '&lt;!--').replace(/\r?\n/g, ' ').trim();
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
  const atxChangelog = /^ {0,3}#{1,6}[ \t]+Changelog\b/im;
  // CommonMark: a setext underline is one or more = or -, and the text line may
  // itself be indented up to 3 spaces. `Changelog\n=` is a valid h1.
  const setextChangelog = /^ {0,3}Changelog[ \t]*\n {0,3}[=-]+[ \t]*$/im;
  if (atxChangelog.test(header) || setextChangelog.test(header)) {
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
