import { defineConfig } from 'vitest/config';

/**
 * Vitest config for @dealerlink/db integration tests.
 *
 * Its one job beyond the defaults is `setupFiles` — loading the database
 * connection env before any test (and the lazy db client) evaluates, so
 * `pnpm test` works from a clean shell in the devcontainer. See DEV.88 and
 * tests/setup-env.ts for the precedence rules.
 *
 * This config is LOCAL to packages/db (not at the repo root) on purpose — a
 * root-level config would be inherited by sibling workspaces and clobber their
 * own `include`, per the note in scripts/vitest.config.ts.
 */
export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./tests/setup-env.ts'],
    // These suites hit a real Postgres: a cold connection plus RLS/tenant
    // context setup can exceed the 5s default on the first test of a file.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
