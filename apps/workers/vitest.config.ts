import { defineConfig } from 'vitest/config';

/**
 * Vitest config for apps/workers.
 *
 * Day 27: `setupFiles` used to point Puppeteer at an arm64-runnable Chromium
 * (DEV.89, tests/setup-chromium.ts). Both are gone with the Chromium pipeline.
 *
 * This config stays LOCAL to apps/workers rather than living at the repo root,
 * so it does not clobber sibling workspaces' `include` (see the note in
 * scripts/vitest.config.ts).
 */
export default defineConfig({
  test: {
    environment: 'node',
    // The snapshot tests render real documents through Typst. Each render is
    // ~66ms, but the suite loads documents from the database, so the default 5s
    // is tight rather than wrong.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
