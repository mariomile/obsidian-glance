import eslint from '@eslint/js';
import obsidianmd from 'eslint-plugin-obsidianmd';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  // The Obsidian community-review ruleset (what the plugin review bot runs).
  ...obsidianmd.configs.recommended,
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      'no-console': ['error', { allow: ['error', 'warn'] }],
    },
  },
  {
    // node:test suites: top-level test() calls return promises the runner
    // tracks itself, and tests run in Node, not in Obsidian.
    files: ['src/**/*.test.ts'],
    rules: {
      '@typescript-eslint/no-floating-promises': 'off',
      'obsidianmd/no-nodejs-modules': 'off',
      'obsidianmd/prefer-window-timers': 'off',
    },
  },
  {
    ignores: ['main.js', 'node_modules/**'],
  },
);
