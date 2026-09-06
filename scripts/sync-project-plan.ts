#!/usr/bin/env tsx
/**
 * sync-project-plan — render the Stage F task table into PROJECT_PLAN.md from
 * `docs/stage-f-tasks.json`, which is the single source of truth.
 *
 * Established Stage F Day 19. The Stage F table is NEVER hand-edited: mark a
 * task complete by editing the JSON and running `pnpm plan:sync`.
 * `pnpm plan:check` renders without writing and exits 1 on drift; it is wired
 * into `pnpm verify` so a stale table fails CI.
 *
 * Safety contract — the script writes ONLY between the marker comments:
 *
 *     <!-- STAGE_F_TASKS:START -->  …generated…  <!-- STAGE_F_TASKS:END -->
 *
 * Every byte outside that block is asserted unchanged before the file is
 * written (`assertOutsideUnchanged`), and on the first run — when the section
 * does not exist yet — the write is asserted to be a single contiguous
 * insertion that preserves the original file byte-for-byte
 * (`assertPureInsertion`). Either assertion failing throws and writes nothing.
 *
 * Output is normalised with Prettier (markdown parser, repo config) so the
 * generated tables match the padding of the hand-written Stage A–E tables and
 * a later `prettier --write` cannot introduce drift.
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

/**
 * Headings the new section is inserted before, in preference order. Stage F
 * belongs after the stage sections and before the cross-cutting summaries.
 */
const INSERT_BEFORE_HEADINGS = [
  '## Phase 2 — Deferred Features',
  '## Progress Summary',
  '## Critical Path Items',
  '## Risks & Open Items',
  '## Changelog',
];

/** PROJECT_PLAN.md "Status Legend" symbols. Unknown status is an error. */
const STATUS_SYMBOLS: Record<string, string> = {
  complete: '✅',
  in_progress: '🔄',
  pending: '⏳',
  parked: '🅿️',
  deferred: '⏭️',
  blocked: '⚠️',
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
  const parsed: unknown = JSON.parse(raw);
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

/** Escape the cell delimiter so a stray `|` cannot break the table. */
function cell(value: string | null): string {
  if (value == null || value === '') return '—';
  return value.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim();
}

/**
 * A sub-phase heading, mirroring Stage B's `### Week 1 — Foundation (Days 1–5)`.
 * The day range is DERIVED from the task rows, never hand-written.
 */
function subPhaseHeading(subPhase: string, tasks: StageFTask[]): string {
  const days = tasks
    .flatMap((t) => t.days.split(/[–-]/).map((d) => Number(d.trim())))
    .filter((n) => Number.isFinite(n));
  if (days.length === 0) return `### ${subPhase}`;
  const lo = Math.min(...days);
  const hi = Math.max(...days);
  return lo === hi ? `### ${subPhase} (Day ${lo})` : `### ${subPhase} (Days ${lo}–${hi})`;
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
 * generated content. Comparing this before and after is the proof that the
 * script touched nothing else.
 */
export function outsideMarkers(plan: string): string {
  const pos = findMarkers(plan);
  if (!pos) return plan;
  return `${plan.slice(0, pos.start)} ${plan.slice(pos.end + MARKER_END.length)}`;
}

function firstDifference(a: string, b: string): number {
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) if (a[i] !== b[i]) return i;
  return len;
}

export function assertOutsideUnchanged(before: string, after: string): void {
  const a = outsideMarkers(before);
  const b = outsideMarkers(after);
  if (a !== b) {
    throw new Error(
      'REFUSING TO WRITE: content outside the STAGE_F_TASKS markers would change ' +
        `(first difference at offset ${firstDifference(a, b)}). The sync script must ` +
        'only ever write between its markers — Stage A–E content must be byte-identical.',
    );
  }
}

/**
 * First-run guarantee: the new section is a single contiguous insertion and
 * the original file survives byte-for-byte on both sides of it.
 */
export function assertPureInsertion(original: string, next: string): void {
  if (next.length <= original.length) {
    throw new Error('REFUSING TO WRITE: creating the Stage F section did not add content.');
  }
  let prefix = 0;
  while (prefix < original.length && original[prefix] === next[prefix]) prefix++;

  const added = next.length - original.length;
  if (original.slice(prefix) !== next.slice(prefix + added)) {
    throw new Error(
      'REFUSING TO WRITE: creating the Stage F section would modify existing content. ' +
        `Expected a single contiguous insertion of ${added} bytes at offset ${prefix}, ` +
        'but the text after the insertion does not match the original.',
    );
  }
}

// ---------------------------------------------------------------------------
// Splicing
// ---------------------------------------------------------------------------

export interface SpliceResult {
  next: string;
  created: boolean;
}

export function spliceBlock(plan: string, block: string): SpliceResult {
  const wrapped = `${MARKER_START}\n\n${block}\n\n${MARKER_END}`;
  const pos = findMarkers(plan);

  if (pos) {
    const next = plan.slice(0, pos.start) + wrapped + plan.slice(pos.end + MARKER_END.length);
    assertOutsideUnchanged(plan, next);
    return { next, created: false };
  }

  // Creating the section. Guard (brief 4.3): a pre-existing "Stage F" heading
  // without markers means some other section owns that name — stop rather
  // than overwrite it.
  const collision = /^#{2,} .*\bStage F\b.*$/im.exec(plan);
  if (collision) {
    throw new Error(
      `PROJECT_PLAN.md already contains a Stage F heading ("${collision[0].trim()}") but no ` +
        'STAGE_F_TASKS markers. Refusing to overwrite a section this script does not own. ' +
        'Add the markers manually inside the intended section, then re-run plan:sync.',
    );
  }

  const section = `${SECTION_HEADING}\n\n${wrapped}\n\n---\n\n`;
  const anchor = INSERT_BEFORE_HEADINGS.map((h) => plan.indexOf(`\n${h}`)).find((i) => i !== -1);
  const at = anchor === undefined ? plan.length : anchor + 1;

  const next = plan.slice(0, at) + section + plan.slice(at);
  assertPureInsertion(plan, next);
  return { next, created: true };
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export interface RunResult {
  changed: boolean;
  created: boolean;
  taskCount: number;
}

export async function run(argv: string[]): Promise<RunResult> {
  const check = argv.includes('--check');

  const tasks = parseTasks(await readFile(TASKS_PATH, 'utf8'));
  const plan = await readFile(PLAN_PATH, 'utf8');
  const block = await formatBlock(renderBlock(tasks));
  const { next, created } = spliceBlock(plan, block);
  const changed = next !== plan;

  if (check) {
    if (changed) {
      console.error(
        'FAIL: PROJECT_PLAN.md is out of date with docs/stage-f-tasks.json.\n' +
          `  ${created ? 'The Stage F section is missing entirely.' : 'The generated table has drifted.'}\n` +
          '  Run `pnpm plan:sync` to regenerate it. Never hand-edit the table.',
      );
      process.exitCode = 1;
    } else {
      console.log(`OK: PROJECT_PLAN.md Stage F table is in sync (${tasks.length} tasks).`);
    }
    return { changed, created, taskCount: tasks.length };
  }

  if (changed) {
    await writeFile(PLAN_PATH, next, 'utf8');
    console.log(
      `OK: ${created ? 'Created' : 'Updated'} the Stage F table in PROJECT_PLAN.md ` +
        `(${tasks.length} tasks).`,
    );
  } else {
    console.log(`OK: PROJECT_PLAN.md already in sync (${tasks.length} tasks) — no write.`);
  }
  return { changed, created, taskCount: tasks.length };
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
