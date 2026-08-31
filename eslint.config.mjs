import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'

// Minimal, working lint setup (eslint was previously referenced in
// package.json but never installed, so `npm run lint` failed outright).
// Scoped to real-bug detection (undefined identifiers, core mistakes) rather
// than style — the codebase relies on TypeScript for typing and is not
// style-linted yet, so stylistic rules stay off.
export default [
  {
    ignores: ['node_modules/**', '.next/**', 'out/**', 'build/**', 'convex/_generated/**', 'next-env.d.ts'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{js,mjs,cjs,ts,tsx}'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
      // Scrapers/AI-parsing code deliberately works with loosely-typed data.
      '@typescript-eslint/no-explicit-any': 'off',
      // AI output sanitization intentionally strips control characters
      // (\u0000-\u001F) with a range in a regex before JSON.parse.
      'no-control-regex': 'off',
    },
  },
]
