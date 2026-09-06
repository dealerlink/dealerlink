import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

/**
 * Vitest project for repo tooling under `scripts/`.
 *
 * Deliberately NOT at the repo root: Vitest walks up from a package's cwd
 * looking for a config, so a root-level `vitest.config.ts` is inherited by the
 * workspaces that do not define their own (`packages/schemas`, `packages/tax`,
 * `packages/db`, `apps/workers`) and overrides their `include`, breaking
 * `pnpm -r test`.
 *
 * `root` is pinned to this directory because Vitest resolves `root` from
 * `process.cwd()` (the repo root when invoked as `pnpm test:scripts`), not from
 * the config file's location — without it the include glob sweeps the entire
 * monorepo.
 *
 * Run via `pnpm test:scripts`, which the root `pnpm test` chains after
 * `pnpm -r test`.
 */
export default defineConfig({
  test: {
    root: path.dirname(fileURLToPath(import.meta.url)),
    include: ['**/*.test.ts'],
    environment: 'node',
    // The sync-script tests spawn the real CLI through tsx; a cold spawn is
    // slower than the 5s default.
    testTimeout: 30_000,
  },
});
