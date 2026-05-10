/** @type {import("eslint").Linter.Config} */
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint', 'import'],
  extends: [
    'eslint:recommended',
    // Use non-type-checked recommended — type-checked rules need parserOptions.project
    // and are configured per-app (apps/web/.eslintrc.json uses next/core-web-vitals)
    'plugin:@typescript-eslint/recommended',
  ],
  rules: {
    // Enforce import ordering
    'import/order': [
      'error',
      {
        groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
        pathGroups: [
          { pattern: 'react', group: 'external', position: 'before' },
          { pattern: 'next/**', group: 'external', position: 'before' },
          { pattern: '@/**', group: 'internal' },
        ],
        pathGroupsExcludedImportTypes: ['react'],
        alphabetize: { order: 'asc', caseInsensitive: true },
        'newlines-between': 'always',
      },
    ],
    // No any — use unknown + narrowing
    '@typescript-eslint/no-explicit-any': 'error',
    // No as casts except narrowing after runtime check
    '@typescript-eslint/consistent-type-assertions': [
      'error',
      { assertionStyle: 'as', objectLiteralTypeAssertions: 'never' },
    ],
    // Unused vars should be errors (prefix with _ to intentionally ignore)
    '@typescript-eslint/no-unused-vars': [
      'error',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
    ],
  },
  overrides: [
    {
      // Config files — relax rules
      files: [
        '*.config.js',
        '*.config.ts',
        '*.config.mjs',
        'tailwind.config.ts',
        'postcss.config.js',
      ],
      rules: {
        '@typescript-eslint/no-var-requires': 'off',
      },
    },
  ],
  ignorePatterns: [
    'node_modules/',
    '.next/',
    'dist/',
    'build/',
    'coverage/',
    '*.min.js',
    'packages/db/migrations/',
  ],
};
