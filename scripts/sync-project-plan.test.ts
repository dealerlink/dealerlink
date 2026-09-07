/**
 * Tests for `scripts/sync-project-plan.ts` (Stage F Day 19).
 *
 * The script writes into PROJECT_PLAN.md, so the safety properties matter more
 * than the rendering: it must touch nothing outside its markers, be idempotent,
 * and refuse to run against a malformed file. The CLI-level tests drive the
 * real binary through `tsx` against fixtures (via the STAGE_F_TASKS_PATH /
 * PROJECT_PLAN_PATH env overrides) so the exit codes are the genuine ones.
 */
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  MARKER_END,
  MARKER_START,
  assertOutsideUnchanged,
  findMarkers,
  formatBlock,
  outsideMarkers,
  parseTasks,
  renderBlock,
  spliceBlock,
  type StageFTask,
} from './sync-project-plan';

const execFileAsync = promisify(execFile);

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = path.join(REPO_ROOT, 'scripts', 'sync-project-plan.ts');
const REAL_TASKS = path.join(REPO_ROOT, 'docs', 'stage-f-tasks.json');
const REAL_PLAN = path.join(REPO_ROOT, 'PROJECT_PLAN.md');

/**
 * The 30 canonical task ids that came from the v2 plan table (removed in v3 —
 * docs/stage-f-tasks.json is now the only copy). Ids are stable
 * cross-references, so new tasks are APPENDED, never renumbered: this asserts
 * F.1-F.30 all still exist, not that they are the whole list.
 */
const CANONICAL_IDS = Array.from({ length: 30 }, (_, i) => `F.${i + 1}`);

let tasksJson: string;
let tasks: StageFTask[];
let block: string;
let tmp: string;
/** A known-present task, for mutation fixtures (sample is `T | undefined`). */
let sample: StageFTask;

beforeAll(async () => {
  tasksJson = await readFile(REAL_TASKS, 'utf8');
  tasks = parseTasks(tasksJson);
  const [first] = tasks;
  if (!first) throw new Error('stage-f-tasks.json has no tasks');
  sample = first;
  block = await formatBlock(renderBlock(tasks));
  tmp = await mkdtemp(path.join(tmpdir(), 'stage-f-sync-'));
});

afterAll(async () => {
  if (tmp) await rm(tmp, { recursive: true, force: true });
});

/** Run the real CLI against fixture paths. Returns the exit code + streams. */
async function runCli(
  planPath: string,
  args: string[] = [],
): Promise<{ code: number; stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await execFileAsync(
      path.join(REPO_ROOT, 'node_modules', '.bin', 'tsx'),
      [SCRIPT, ...args],
      { env: { ...process.env, STAGE_F_TASKS_PATH: REAL_TASKS, PROJECT_PLAN_PATH: planPath } },
    );
    return { code: 0, stdout, stderr };
  } catch (err) {
    const e = err as { code?: number; stdout?: string; stderr?: string };
    return { code: e.code ?? 1, stdout: e.stdout ?? '', stderr: e.stderr ?? '' };
  }
}

describe('task source of truth', () => {
  it('parses and contains every canonical F.1–F.30 task', () => {
    const ids = tasks.map((t) => t.id);
    for (const id of CANONICAL_IDS) expect(ids).toContain(id);
  });

  it('has no duplicate ids and a known status on every task', () => {
    expect(new Set(tasks.map((t) => t.id)).size).toBe(tasks.length);
    for (const t of tasks)
      expect(t.status).toMatch(/^(pending|in_progress|complete|parked|deferred|blocked)$/);
  });

  it('rejects an unknown status', () => {
    const bad = JSON.stringify({ tasks: [{ ...sample, status: 'nearly' }] });
    expect(() => parseTasks(bad)).toThrow(/unknown status/);
  });

  it('rejects a duplicate id', () => {
    const bad = JSON.stringify({ tasks: [sample, sample] });
    expect(() => parseTasks(bad)).toThrow(/duplicate task id/);
  });
});

describe('rendering', () => {
  it('renders one table row per task, covering all 30 canonical tasks', () => {
    const rows = block.split('\n').filter((l) => /^\| F\./.test(l));
    expect(rows).toHaveLength(tasks.length);
    for (const id of CANONICAL_IDS) {
      expect(rows.some((r) => r.startsWith(`| ${id} `))).toBe(true);
    }
  });

  it('uses the Stage B column format', () => {
    // Prettier pads header cells to the column width, so match on the
    // sequence of headings rather than exact spacing.
    expect(block).toMatch(
      /\|\s*#\s*\|\s*Day\s*\|\s*Deliverable\s*\|\s*Status\s*\|\s*Date\s*\|\s*Notes\s*\|/,
    );
    expect(renderBlock(tasks)).toContain('| # | Day | Deliverable | Status | Date | Notes |');
  });

  it('escapes a pipe in a note so the table cannot break', () => {
    const rendered = renderBlock([{ ...sample, id: 'F.99', notes: 'a | b', completedDate: null }]);
    const row = rendered.split('\n').find((l) => l.startsWith('| F.99 '));
    expect(row).toContain('a \\| b');
    expect(row?.match(/(?<!\\)\|/g)).toHaveLength(7); // 6 columns => 7 delimiters
  });

  it('is stable under prettier (the block is already formatted)', async () => {
    expect(await formatBlock(block)).toBe(block);
  });
});

describe('marker validation — refuses malformed or nested markers', () => {
  it('returns null when neither marker is present', () => {
    expect(findMarkers('# Plan\n\nnothing here\n')).toBeNull();
  });

  it('throws on duplicated (nested) markers', () => {
    const nested = `a ${MARKER_START} b ${MARKER_START} c ${MARKER_END} d`;
    expect(() => findMarkers(nested)).toThrow(/malformed markers/);
  });

  it('throws on a duplicated END marker', () => {
    expect(() => findMarkers(`${MARKER_START} x ${MARKER_END} y ${MARKER_END}`)).toThrow(
      /malformed markers/,
    );
  });

  it('throws on a lone START marker', () => {
    expect(() => findMarkers(`intro ${MARKER_START} body`)).toThrow(/malformed markers/);
  });

  it('throws on a lone END marker', () => {
    expect(() => findMarkers(`intro ${MARKER_END} body`)).toThrow(/malformed markers/);
  });

  it('throws when END precedes START', () => {
    expect(() => findMarkers(`${MARKER_END} middle ${MARKER_START}`)).toThrow(/END appears before/);
  });

  it('refuses to create the section when a Stage F heading already exists', () => {
    const plan = '# Plan\n\n## Stage F — Something Else\n\nowned by someone else\n';
    expect(() => spliceBlock(plan, block)).toThrow(/already contains a Stage F heading/);
  });
});

describe('safety — nothing outside the markers is ever touched', () => {
  const before = `# Plan\n\n## Stage A\n\nalpha\n\n## Stage F — Phase 2\n\n${MARKER_START}\n\nOLD CONTENT\n\n${MARKER_END}\n\n## Changelog\n\nomega\n`;

  it('replaces only the marker block (byte comparison of the remainder)', () => {
    const { next, created } = spliceBlock(before, block);
    expect(created).toBe(false);
    expect(outsideMarkers(next)).toBe(outsideMarkers(before));
    expect(next).not.toContain('OLD CONTENT');
  });

  it('preserves the exact prefix and suffix bytes', () => {
    const { next } = spliceBlock(before, block);
    expect(next.startsWith('# Plan\n\n## Stage A\n\nalpha\n\n## Stage F — Phase 2\n\n')).toBe(true);
    expect(next.endsWith('\n\n## Changelog\n\nomega\n')).toBe(true);
  });

  it('assertOutsideUnchanged throws when surrounding content differs', () => {
    const tampered = before.replace('alpha', 'TAMPERED');
    expect(() => assertOutsideUnchanged(before, tampered)).toThrow(/REFUSING TO WRITE/);
  });

  it('creating the section is a pure insertion — the original survives intact', () => {
    const plan = '# Plan\n\n## Stage A\n\nalpha\n\n## Changelog\n\nomega\n';
    const { next, created } = spliceBlock(plan, block);
    expect(created).toBe(true);
    // Removing exactly the inserted span must reproduce the original bytes.
    const at = next.indexOf('## Stage F — Phase 2');
    const added = next.length - plan.length;
    expect(next.slice(0, at) + next.slice(at + added)).toBe(plan);
  });
});

describe('idempotency', () => {
  it('splicing twice produces an identical document', () => {
    const plan = '# Plan\n\n## Stage A\n\nalpha\n\n## Changelog\n\nomega\n';
    const once = spliceBlock(plan, block).next;
    const twice = spliceBlock(once, block).next;
    expect(twice).toBe(once);
  });
});

describe('CLI', () => {
  it('creates, then a second run is a no-op, then --check passes', async () => {
    const planPath = path.join(tmp, 'cli-plan.md');
    await writeFile(planPath, '# Plan\n\n## Stage A\n\nalpha\n\n## Changelog\n\nomega\n', 'utf8');

    const first = await runCli(planPath);
    expect(first.code).toBe(0);
    expect(first.stdout).toMatch(/Created/);
    const afterFirst = await readFile(planPath, 'utf8');

    const second = await runCli(planPath);
    expect(second.code).toBe(0);
    expect(second.stdout).toMatch(/already in sync/);
    expect(await readFile(planPath, 'utf8')).toBe(afterFirst);

    const check = await runCli(planPath, ['--check']);
    expect(check.code).toBe(0);
    expect(check.stdout).toMatch(/in sync/);
  });

  it('--check exits 1 when the table is stale, and writes nothing', async () => {
    const planPath = path.join(tmp, 'stale-plan.md');
    const stale = `# Plan\n\n## Stage F — Phase 2\n\n${MARKER_START}\n\nSTALE\n\n${MARKER_END}\n\n## Changelog\n`;
    await writeFile(planPath, stale, 'utf8');

    const res = await runCli(planPath, ['--check']);
    expect(res.code).toBe(1);
    expect(res.stderr).toMatch(/out of date/);
    expect(await readFile(planPath, 'utf8')).toBe(stale);
  });

  it('--check exits 1 when the section is missing entirely', async () => {
    const planPath = path.join(tmp, 'missing-plan.md');
    await writeFile(planPath, '# Plan\n\n## Changelog\n', 'utf8');

    const res = await runCli(planPath, ['--check']);
    expect(res.code).toBe(1);
    expect(res.stderr).toMatch(/missing entirely/);
  });

  it('exits 1 on malformed markers rather than writing', async () => {
    const planPath = path.join(tmp, 'nested-plan.md');
    const nested = `# Plan\n\n${MARKER_START}\n\n${MARKER_START}\n\nx\n\n${MARKER_END}\n`;
    await writeFile(planPath, nested, 'utf8');

    const res = await runCli(planPath);
    expect(res.code).toBe(1);
    expect(res.stderr).toMatch(/malformed markers/);
    expect(await readFile(planPath, 'utf8')).toBe(nested);
  });
});

describe('the live PROJECT_PLAN.md', () => {
  it('is in sync with docs/stage-f-tasks.json', async () => {
    const plan = await readFile(REAL_PLAN, 'utf8');
    expect(spliceBlock(plan, block).next).toBe(plan);
  });

  it('still contains every Stage A–E heading', async () => {
    const plan = await readFile(REAL_PLAN, 'utf8');
    for (const heading of [
      '## Stage 0 — Discovery & Decisions',
      '## Stage A — Foundation Setup',
      '## Stage B — The 3.5-Week Build',
      '## Stage C — Internal Validation (Week 5)',
      '## Stage D — Production Infrastructure',
      '## Stage E — Launch & Onboarding',
      '## Changelog',
    ]) {
      expect(plan).toContain(heading);
    }
  });
});
