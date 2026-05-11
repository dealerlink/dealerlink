import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Playwright specs live under tests/e2e and use the Playwright runner.
    exclude: ['node_modules/**', 'tests/e2e/**', '.next/**', 'dist/**'],
  },
});
