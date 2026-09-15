/**
 * Tests for `scripts/check-path-references.mjs`.
 *
 * THE FIRST TEST IS THE ONE THAT MATTERS, and it exists because of how this
 * check first failed. It passed locally and went red on CI, because when it was
 * run locally its own two files were still UNTRACKED — the scanner enumerates
 * `git ls-files`, so it never scanned itself. The moment they were committed it
 * started reading its own allowlist, whose rows name paths that deliberately do
 * not exist, and reported every one as dangling.
 *
 * So the property to hold is not "the check passes" but "the check can see
 * itself when it runs". A check validated against a tree in which the check is
 * invisible has not been validated.
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const CHECKER = 'scripts/check-path-references.mjs';
const ALLOWLIST = 'scripts/path-reference-allowlist.json';

/** The extensions the checker scans — kept in step with SEARCHABLE in the script. */
const SEARCHABLE = /\.(md|json|ts|tsx|mjs|js|yml|yaml)$/;

function trackedFiles(): string[] {
  return execFileSync('git', ['ls-files'], { cwd: REPO_ROOT, encoding: 'utf8' }).trim().split('\n');
}

function runChecker(): { code: number; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync('node', [CHECKER], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: 'pipe',
    });
    return { code: 0, stdout, stderr: '' };
  } catch (err) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    return { code: e.status ?? 1, stdout: e.stdout ?? '', stderr: e.stderr ?? '' };
  }
}

describe('the checker is inside its own scan', () => {
  it('tracks both of its own files, so the scan reaches them', () => {
    const tracked = new Set(trackedFiles());
    // Untracked here is exactly the state that hid the self-reference defect.
    expect(tracked.has(CHECKER), `${CHECKER} must be tracked`).toBe(true);
    expect(tracked.has(ALLOWLIST), `${ALLOWLIST} must be tracked`).toBe(true);
  });

  it('scans files of its own two extensions', () => {
    expect(SEARCHABLE.test(CHECKER)).toBe(true);
    expect(SEARCHABLE.test(ALLOWLIST)).toBe(true);
  });

  it('allowlists its own rows explicitly rather than skipping the file in code', async () => {
    // The precedent is scripts/id-reference-allowlist.json, which carries four
    // self-referential entries reading "This file names the ids it allows."
    // Keeping the mechanism in DATA keeps it visible; a skip-list in the
    // scanner would hide the fact that the file mentions absent paths at all.
    const { readFile } = await import('node:fs/promises');
    const raw = JSON.parse(await readFile(path.join(REPO_ROOT, ALLOWLIST), 'utf8')) as {
      allow: Array<{ path: string; file: string; kind: string; reason: string }>;
    };
    const selfRows = raw.allow.filter((e) => e.file === ALLOWLIST || e.file === CHECKER);
    expect(selfRows.length).toBeGreaterThan(0);
    for (const row of selfRows) expect(row.reason).not.toBe('');
  });
});

describe('the check itself', () => {
  it('passes against the committed tree', () => {
    const res = runChecker();
    expect(res.stderr).toBe('');
    expect(res.code).toBe(0);
    expect(res.stdout).toContain('every cited docs/ path resolves');
  });

  it('reports planned deliverables so an unwritten file is visible, not silent', () => {
    const res = runChecker();
    expect(res.stdout).toContain('PLANNED DELIVERABLES');
  });

  it('every allowlist row carries a reason and a kind', async () => {
    const { readFile } = await import('node:fs/promises');
    const raw = JSON.parse(await readFile(path.join(REPO_ROOT, ALLOWLIST), 'utf8')) as {
      allow: Array<{ path: string; file: string; kind: string; reason: string; task?: string }>;
    };
    for (const row of raw.allow) {
      expect(row.reason, `${row.path} in ${row.file}`).toBeTruthy();
      expect(['deliberate-mention', 'planned-deliverable']).toContain(row.kind);
      // A planned-deliverable without a task cannot expire, so it would rot.
      if (row.kind === 'planned-deliverable') expect(row.task).toBeTruthy();
    }
  });
});
