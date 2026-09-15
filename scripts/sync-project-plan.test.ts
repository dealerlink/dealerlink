/**
 * Tests for `scripts/sync-project-plan.ts` (Stage F Day 19; whole-document
 * rendering added by F.37/F.63).
 *
 * The script now renders the ENTIRE PROJECT_PLAN.md from
 * `docs/stage-f-tasks.json` plus `docs/project-plan-header.md`, so the old
 * safety properties — "touches nothing outside its markers", "the first write
 * is a pure insertion" — no longer have a subject: there is no authored
 * content in the file to protect. What replaces them is stricter and simpler:
 * the file must EQUAL the render, byte for byte, or `plan:check` fails.
 *
 * The structural assertions that used to pin Stage 0/A-E inside
 * PROJECT_PLAN.md now pin them inside `docs/PROJECT_HISTORY.md`, which is
 * where that content lives. They moved with the content rather than being
 * deleted (F.37's instruction).
 *
 * The CLI-level tests drive the real binary through `tsx` against fixtures
 * (STAGE_F_TASKS_PATH / PROJECT_PLAN_PATH / PROJECT_PLAN_HEADER_PATH) so the
 * exit codes are the genuine ones.
 */
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  BLOCK_SENTINEL,
  MARKER_END,
  MARKER_START,
  findMarkers,
  formatBlock,
  insideMarkers,
  outsideMarkers,
  parseTasks,
  renderBlock,
  renderPlan,
  type StageFTask,
} from './sync-project-plan';

const execFileAsync = promisify(execFile);

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = path.join(REPO_ROOT, 'scripts', 'sync-project-plan.ts');
const REAL_TASKS = path.join(REPO_ROOT, 'docs', 'stage-f-tasks.json');
const REAL_PLAN = path.join(REPO_ROOT, 'PROJECT_PLAN.md');
const REAL_HEADER = path.join(REPO_ROOT, 'docs', 'project-plan-header.md');
const REAL_HISTORY = path.join(REPO_ROOT, 'docs', 'PROJECT_HISTORY.md');

/**
 * The 30 canonical task ids that came from the v2 plan table (removed in v3 —
 * docs/stage-f-tasks.json is now the only copy). Ids are stable
 * cross-references, so new tasks are APPENDED, never renumbered: this asserts
 * F.1-F.30 all still exist, not that they are the whole list.
 */
const CANONICAL_IDS = Array.from({ length: 30 }, (_, i) => `F.${i + 1}`);

let tasksJson: string;
let tasks: StageFTask[];
let header: string;
let block: string;
let rendered: string;
let tmp: string;
/** A known-present task, for mutation fixtures (sample is `T | undefined`). */
let sample: StageFTask;

beforeAll(async () => {
  tasksJson = await readFile(REAL_TASKS, 'utf8');
  tasks = parseTasks(tasksJson);
  const [first] = tasks;
  if (!first) throw new Error('stage-f-tasks.json has no tasks');
  sample = first;
  header = await readFile(REAL_HEADER, 'utf8');
  block = await formatBlock(renderBlock(tasks));
  rendered = await formatBlock(renderPlan(header, tasks));
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
      {
        env: {
          ...process.env,
          STAGE_F_TASKS_PATH: REAL_TASKS,
          PROJECT_PLAN_PATH: planPath,
          PROJECT_PLAN_HEADER_PATH: REAL_HEADER,
        },
      },
    );
    return { code: 0, stdout, stderr };
  } catch (err) {
    const e = err as { code?: number; stdout?: string; stderr?: string };
    return { code: e.code ?? 1, stdout: e.stdout ?? '', stderr: e.stderr ?? '' };
  }
}

describe('task source of truth', () => {
  it('parses and contains every canonical F.1–F.30 task', () => {
    const ids = new Set(tasks.map((t) => t.id));
    for (const id of CANONICAL_IDS) expect(ids.has(id)).toBe(true);
  });

  it('has no duplicate ids and a known status on every task', () => {
    const ids = tasks.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('rejects an unknown status', () => {
    const bad = JSON.stringify({ tasks: [{ ...sample, status: 'almost' }] });
    expect(() => parseTasks(bad)).toThrow(/unknown status/);
  });

  it('rejects a duplicate id', () => {
    const bad = JSON.stringify({ tasks: [sample, sample] });
    expect(() => parseTasks(bad)).toThrow(/duplicate task id/);
  });
});

describe('rendering the task block', () => {
  it('renders one table row per task, covering all 30 canonical tasks', () => {
    for (const id of CANONICAL_IDS) expect(block).toContain(`| ${id} `);
  });

  it('uses the Stage B column format', () => {
    expect(block).toMatch(
      /\|\s*#\s*\|\s*Day\s*\|\s*Deliverable\s*\|\s*Status\s*\|\s*Date\s*\|\s*Notes\s*\|/,
    );
  });

  it('escapes a pipe in a note so the table cannot break', () => {
    const piped = renderBlock([{ ...sample, notes: 'a | b' }]);
    expect(piped).toContain('a \\| b');
  });

  it('is stable under prettier (the block is already formatted)', async () => {
    expect(await formatBlock(block)).toBe(block);
  });
});

describe('rendering the whole document', () => {
  it('opens with a DO-NOT-EDIT banner naming both sources', () => {
    expect(rendered).toMatch(/^<!-- GENERATED FILE — DO NOT EDIT\./);
    expect(rendered).toContain('docs/stage-f-tasks.json');
    expect(rendered).toContain('docs/project-plan-header.md');
  });

  it('includes the committed header template verbatim', () => {
    const firstLine = header.trim().split('\n')[0] ?? '';
    expect(rendered).toContain(firstLine);
  });

  // Scoped to the TEMPLATE on purpose. The rendered document contains the
  // phrase legitimately — F.63's notes QUOTE the defective line 3 in order to
  // explain why it had to be corrected, and task notes render into the table.
  // This is the same self-tripping shape the Changelog guard below documents:
  // a substring assertion over a document that contains prose about itself.
  it('the template carries no instruction to append to a changelog', () => {
    expect(header).not.toMatch(/append a dated entry/i);
    expect(header).not.toMatch(/changelog/i);
  });

  it('generates the Status Legend from the status map, not by hand', () => {
    for (const symbol of ['✅', '🔄', '⏳', '🅿️', '⏭️', '⚠️']) {
      expect(rendered).toMatch(new RegExp(`\\|\\s*${symbol}\\s*\\|`));
    }
    expect(rendered).toContain('## Status Legend');
  });

  it('reports a per-status summary whose total matches the task count', () => {
    expect(rendered).toContain('## Stage F Progress');
    expect(rendered).toMatch(
      new RegExp(`\\|\\s*\\*\\*Total\\*\\*\\s*\\|\\s*\\*\\*${tasks.length}\\*\\*\\s*\\|`),
    );
  });

  it('contains exactly one of each marker, in order', () => {
    expect(rendered.split(MARKER_START).length - 1).toBe(1);
    expect(rendered.split(MARKER_END).length - 1).toBe(1);
    expect(rendered.indexOf(MARKER_START)).toBeLessThan(rendered.indexOf(MARKER_END));
  });

  it('puts the task tables inside the markers and nothing else there', () => {
    const inside = insideMarkers(rendered) ?? '';
    for (const id of CANONICAL_IDS) expect(inside).toContain(`| ${id} `);
    expect(inside).not.toContain('## Status Legend');
  });

  it('points at PROJECT_HISTORY.md rather than carrying the narrative', () => {
    expect(rendered).toContain('docs/PROJECT_HISTORY.md');
    for (const heading of ['## Stage 0 —', '## Stage A —', '## Risks & Open Items']) {
      expect(rendered).not.toContain(heading);
    }
  });

  it('is idempotent — rendering twice is byte-identical', async () => {
    expect(await formatBlock(renderPlan(header, tasks))).toBe(rendered);
  });
});

describe('marker validation — refuses malformed or nested markers', () => {
  it('returns null when neither marker is present', () => {
    expect(findMarkers('# Plan\n')).toBeNull();
  });

  it('throws on duplicated (nested) markers', () => {
    expect(() => findMarkers(`${MARKER_START}${MARKER_START}${MARKER_END}`)).toThrow();
  });

  it('throws on a duplicated END marker', () => {
    expect(() => findMarkers(`${MARKER_START}${MARKER_END}${MARKER_END}`)).toThrow();
  });

  it('throws on a lone START marker', () => {
    expect(() => findMarkers(`x${MARKER_START}y`)).toThrow();
  });

  it('throws on a lone END marker', () => {
    expect(() => findMarkers(`x${MARKER_END}y`)).toThrow();
  });

  it('throws when END precedes START', () => {
    expect(() => findMarkers(`${MARKER_END}x${MARKER_START}`)).toThrow();
  });
});

describe('region split — which half drifted', () => {
  it('substitutes a PRINTABLE sentinel for the block, never a NUL', () => {
    expect(BLOCK_SENTINEL).not.toContain('\0');
    const outside = outsideMarkers(rendered);
    expect(outside).toContain(BLOCK_SENTINEL);
    expect(outside).not.toContain('\0');
  });

  it('keeps the script itself free of NUL bytes, so search tools can read it', async () => {
    const source = await readFile(SCRIPT, 'utf8');
    expect(source).not.toContain('\0');
  });

  it('isolates a task-table change to the inside region', async () => {
    // The FULL list with one note altered. A single-task list would also change
    // the generated summary counts, which live outside the markers — the test
    // would then pass for the wrong reason.
    const altered = tasks.map((t, i) => (i === 0 ? { ...t, notes: 'changed note' } : t));
    const other = await formatBlock(renderPlan(header, altered));
    expect(insideMarkers(other)).not.toBe(insideMarkers(rendered));
    expect(outsideMarkers(other)).toBe(outsideMarkers(rendered));
  });

  it('isolates a header change to the outside region', async () => {
    const other = await formatBlock(renderPlan(`${header}\n\n> extra line\n`, tasks));
    expect(insideMarkers(other)).toBe(insideMarkers(rendered));
    expect(outsideMarkers(other)).not.toBe(outsideMarkers(rendered));
  });
});

describe('CLI', () => {
  it('renders from nothing, then a second run is a no-op, then --check passes', async () => {
    const planPath = path.join(tmp, 'fresh.md');
    const first = await runCli(planPath);
    expect(first.code).toBe(0);
    expect(first.stdout).toContain('Rendered PROJECT_PLAN.md');

    const second = await runCli(planPath);
    expect(second.code).toBe(0);
    expect(second.stdout).toContain('no write');

    const checked = await runCli(planPath, ['--check']);
    expect(checked.code).toBe(0);
    expect(checked.stdout).toContain('in sync');
  });

  it('--check exits 1 when the file is stale, and writes nothing', async () => {
    const planPath = path.join(tmp, 'stale.md');
    await runCli(planPath);
    const before = await readFile(planPath, 'utf8');
    await writeFile(planPath, `${before}\n\n## Hand-Added Section\n`, 'utf8');
    const after = await readFile(planPath, 'utf8');

    const res = await runCli(planPath, ['--check']);
    expect(res.code).toBe(1);
    expect(res.stderr).toContain('out of date');
    expect(await readFile(planPath, 'utf8')).toBe(after);
  });

  it('names the JSON when the task tables are what drifted', async () => {
    const planPath = path.join(tmp, 'drift-inside.md');
    await runCli(planPath);
    const plan = await readFile(planPath, 'utf8');
    const pos = findMarkers(plan);
    if (!pos) throw new Error('rendered fixture has no markers');
    const mangled = `${plan.slice(0, pos.start)}${MARKER_START}\n| x |\n${MARKER_END}${plan.slice(
      pos.end + MARKER_END.length,
    )}`;
    await writeFile(planPath, mangled, 'utf8');

    const res = await runCli(planPath, ['--check']);
    expect(res.code).toBe(1);
    expect(res.stderr).toContain('docs/stage-f-tasks.json');
  });

  it('exits 1 on malformed markers rather than writing', async () => {
    const planPath = path.join(tmp, 'malformed.md');
    const body = `# Plan\n\n${MARKER_START}\n${MARKER_START}\n${MARKER_END}\n`;
    await writeFile(planPath, body, 'utf8');
    const res = await runCli(planPath, ['--check']);
    expect(res.code).toBe(1);
    expect(await readFile(planPath, 'utf8')).toBe(body);
  });
});

describe('the live PROJECT_PLAN.md', () => {
  it('equals the render, byte for byte — no hand edits anywhere', async () => {
    const plan = await readFile(REAL_PLAN, 'utf8');
    expect(plan.trimEnd()).toBe(rendered.trimEnd());
  });

  it('carries the generated banner', async () => {
    const plan = await readFile(REAL_PLAN, 'utf8');
    expect(plan).toContain('GENERATED FILE — DO NOT EDIT.');
  });
});

describe('docs/PROJECT_HISTORY.md — where the narrative went', () => {
  // These assertions used to pin Stage 0/A-E inside PROJECT_PLAN.md. F.63 moved
  // the content; F.37's instruction was that the assertions move WITH it rather
  // than be deleted, so that losing a stage still fails a test.
  it('contains every Stage 0–E heading', async () => {
    const history = await readFile(REAL_HISTORY, 'utf8');
    for (const heading of [
      '## Stage 0 — Discovery & Decisions',
      '## Stage A — Foundation Setup',
      '## Stage B — The 3.5-Week Build',
      '## Stage C — Internal Validation (Week 5)',
      '## Stage D — Production Infrastructure',
      '## Stage E — Launch & Onboarding',
    ]) {
      expect(history).toContain(heading);
    }
  });

  it('contains the risk register and the deferred-feature list', async () => {
    const history = await readFile(REAL_HISTORY, 'utf8');
    expect(history).toContain('## Risks & Open Items');
    expect(history).toContain('## Phase 2 — Deferred Features');
  });

  it('records that Stage E did not complete', async () => {
    const history = await readFile(REAL_HISTORY, 'utf8');
    expect(history).toMatch(/Stage E did not complete/);
  });

  // The B.10 row used to name a DEV id that has no entry (DEV.128 records
  // which id, and that this sense was never written up). Asserted POSITIVELY —
  // on the corrected wording rather than on the absence of the bad id —
  // because spelling the bad id here would itself be a dangling citation and
  // `pnpm check:ids` counts a test name as a citation like any other.
  it('describes the Day 8 seed bug without citing a nonexistent entry', async () => {
    const history = await readFile(REAL_HISTORY, 'utf8');
    expect(history).toMatch(/NO DEV entry was ever written for it/);
    expect(history).toContain('packages/db/src/seeds/day8.ts');
  });
});

// DEV.110 — the Changelog section was DELETED on Day 24, and this asserts it
// stays deleted. Both files are checked now, and the reason differs per file.
//
// PROJECT_PLAN.md cannot acquire one by hand any more — it is generated in its
// entirety, so the ban holds structurally and this assertion is a backstop
// against the TEMPLATE growing one. PROJECT_HISTORY.md is hand-maintained, so
// there the assertion is the only thing standing in the way.
//
// LINE-ANCHORED, and it has to be. A substring guard tripped on itself: a
// Stage F task note that merely DISCUSSES the banned section renders into the
// generated table, and the substring then appears as prose rather than as a
// heading. F.63's and F.65's notes did exactly that and turned the `test` job
// red. What is banned is a Changelog SECTION — in Markdown, a heading at the
// start of a line — so that, and only that, is what this matches.
describe('the Changelog section stays deleted (DEV.110)', () => {
  it('is absent from the generated plan', async () => {
    const plan = await readFile(REAL_PLAN, 'utf8');
    expect(plan).not.toMatch(/^#{1,6}\s+Changelog\b/m);
  });

  it('is absent from the header template it would have to come from', async () => {
    expect(header).not.toMatch(/^#{1,6}\s+Changelog\b/m);
  });

  it('is absent from the hand-maintained history file', async () => {
    const history = await readFile(REAL_HISTORY, 'utf8');
    expect(history).not.toMatch(/^#{1,6}\s+Changelog\b/m);
  });
});
