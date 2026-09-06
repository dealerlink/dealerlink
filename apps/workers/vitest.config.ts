import { defineConfig } from 'vitest/config';

/**
 * Vitest config for apps/workers.
 *
 * `setupFiles` points Puppeteer at an arm64-runnable Chromium in the
 * devcontainer (DEV.89 — see tests/setup-chromium.ts). Kept LOCAL to
 * apps/workers, not at the repo root, so it does not clobber sibling
 * workspaces' `include` (see the note in scripts/vitest.config.ts).
 */
export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./tests/setup-chromium.ts'],
    // The render smoke test launches a real Chromium; a cold launch can
    // exceed the 5s default.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
