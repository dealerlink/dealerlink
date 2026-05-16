import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Use the automatic JSX runtime so .tsx tests need no `import React`.
  esbuild: { jsx: 'automatic' },
  resolve: {
    // Mirror the tsconfig `@/*` path alias so unit tests can import app code.
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url)),
    },
  },
  test: {
    // Playwright specs live under tests/e2e and use the Playwright runner.
    exclude: ['node_modules/**', 'tests/e2e/**', '.next/**', 'dist/**'],
  },
});
