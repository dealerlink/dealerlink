#!/usr/bin/env node
/**
 * Install the pinned Typst binary (F.38 Day 27, F.66).
 *
 * ONE VERSION, ONE CHECKSUM PER ARCHITECTURE, THREE ENVIRONMENTS. The thing not
 * to repeat while removing DEV.89 is DEV.89: a renderer whose binary differs by
 * architecture. The devcontainer is arm64; CI runners and the DO workers image
 * are x86-64. All three must resolve the same release tag, and each must verify
 * what it downloaded.
 *
 * The version is pinned in three files and they must agree:
 *   - this script                          (devcontainer + CI)
 *   - apps/workers/Dockerfile              (DO workers image)
 *   - .github/workflows/verify.yml         (the determinism check)
 *
 * Why pinning matters more here than for a normal dependency: Typst's layout
 * engine is not contractually stable across versions, and every reference PDF in
 * docs/pdf-references/ was produced against this build. Those references can no
 * longer be regenerated — the Chromium pipeline that made them is gone — so a
 * silent upgrade would invalidate a baseline that cannot be rebuilt.
 *
 * Usage:  pnpm typst:install        (installs to ~/.local/bin/typst)
 *         pnpm typst:install --check (verify only; non-zero if wrong/missing)
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const TYPST_VERSION = '0.15.1';

/** sha256 of the release tarball, per architecture. Verified before install. */
const SHA256 = {
  x64: 'a6d077d0a95eed5a2eba715b2dae06be954f624ccbf85758a03f389ded33118c',
  arm64: '5aa8d74a3d906e60ea12a66ac2f37f8eef1b14cbad7182a745e393a10c23dcee',
};

const TARGET = { x64: 'x86_64-unknown-linux-musl', arm64: 'aarch64-unknown-linux-musl' };

const INSTALL_DIR = process.env.TYPST_INSTALL_DIR ?? path.join(os.homedir(), '.local', 'bin');
const INSTALL_PATH = path.join(INSTALL_DIR, 'typst');

function installedVersion(binary) {
  const r = spawnSync(binary, ['--version'], { encoding: 'utf8' });
  if (r.status !== 0) return null;
  return (r.stdout.match(/typst (\d+\.\d+\.\d+)/) ?? [])[1] ?? null;
}

function check() {
  const candidates = [process.env.TYPST_BIN, INSTALL_PATH, 'typst'].filter(Boolean);
  for (const c of candidates) {
    const v = installedVersion(c);
    if (v === TYPST_VERSION) {
      console.log(`OK: typst ${v} at ${c}`);
      return 0;
    }
    if (v) {
      console.error(`WRONG VERSION: typst ${v} at ${c}, expected ${TYPST_VERSION}.`);
      console.error('Every reference PDF was rendered by the pinned build; a different');
      console.error('version may re-typeset documents the baseline cannot be rebuilt for.');
      return 1;
    }
  }
  console.error(`typst ${TYPST_VERSION} not found. Run: pnpm typst:install`);
  return 1;
}

function install() {
  const arch = process.arch;
  const target = TARGET[arch];
  const sha = SHA256[arch];
  if (!target) throw new Error(`unsupported architecture: ${arch} (expected x64 or arm64)`);

  if (installedVersion(INSTALL_PATH) === TYPST_VERSION) {
    console.log(`typst ${TYPST_VERSION} already installed at ${INSTALL_PATH}`);
    return 0;
  }

  const url = `https://github.com/typst/typst/releases/download/v${TYPST_VERSION}/typst-${target}.tar.xz`;
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'typst-install-'));
  try {
    const tarball = path.join(tmp, 'typst.tar.xz');
    console.log(`→ ${url}`);
    execFileSync('curl', ['-fsSL', '-o', tarball, url], { stdio: 'inherit' });

    const got = createHash('sha256').update(readFileSync(tarball)).digest('hex');
    if (got !== sha) {
      throw new Error(
        `checksum mismatch for ${target}\n  expected ${sha}\n  got      ${got}\n` +
          'Refusing to install. This is either a corrupted download or a changed release asset.',
      );
    }
    console.log(`✓ sha256 ${got}`);

    // GNU tar shells out to the xz binary for -J. The devcontainer image now
    // installs xz-utils (F.66's blocker); if this fails, the container predates
    // that change and needs a rebuild.
    try {
      execFileSync('tar', ['-xJf', tarball, '-C', tmp], { stdio: 'pipe' });
    } catch {
      throw new Error(
        'could not unpack the release: `tar -J` needs the xz binary.\n' +
          'The devcontainer image installs xz-utils as of Day 27 — rebuild the container.',
      );
    }

    mkdirSync(INSTALL_DIR, { recursive: true });
    copyFileSync(path.join(tmp, `typst-${target}`, 'typst'), INSTALL_PATH);
    chmodSync(INSTALL_PATH, 0o755);

    const v = installedVersion(INSTALL_PATH);
    if (v !== TYPST_VERSION) throw new Error(`installed binary reports ${v}, expected ${TYPST_VERSION}`);
    console.log(`✓ typst ${v} installed at ${INSTALL_PATH}`);
    if (!process.env.PATH?.split(':').includes(INSTALL_DIR)) {
      console.log(`  NOTE: ${INSTALL_DIR} is not on PATH; set TYPST_BIN=${INSTALL_PATH} or add it.`);
    }
    return 0;
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

const mode = process.argv.includes('--check') ? check : install;
try {
  process.exit(mode());
} catch (err) {
  // Message only, no stack: every failure here is an environment problem with a
  // stated remedy, and a stack trace buries it.
  console.error(`\n${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}
