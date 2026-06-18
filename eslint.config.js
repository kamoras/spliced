import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,

  // Shared language options
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      // TypeScript resolves identifiers itself; no-undef only adds false
      // positives for global types/values in .ts files.
      'no-undef': 'off',
    },
  },

  // React app code (browser). Accessibility rules are enforced here.
  {
    files: ['src/**/*.{js,jsx,ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { react, 'react-hooks': reactHooks, 'jsx-a11y': jsxA11y },
    settings: { react: { version: 'detect' } },
    rules: {
      ...react.configs.flat.recommended.rules,
      ...react.configs.flat['jsx-runtime'].rules,
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.flatConfigs.recommended.rules,
      'react/prop-types': 'off',
      // react-hooks v7 ships experimental React Compiler rules in its
      // recommended preset. They flag idiomatic patterns we rely on (lazy ref
      // init, ref reads while deriving render values, timer/mount state sync),
      // so disable them here; rules-of-hooks and exhaustive-deps stay on.
      'react-hooks/purity': 'off',
      'react-hooks/refs': 'off',
      'react-hooks/set-state-in-effect': 'off',
    },
  },

  // Node contexts: serverless functions and build/config files.
  {
    files: [
      'api/**/*.{js,ts}',
      'scripts/**/*.{js,mjs,ts}',
      'vite.config.ts',
      'eslint.config.js',
    ],
    languageOptions: { sourceType: 'module', globals: globals.node },
  },

  // Tests + Vitest setup run under jsdom: both browser and node globals.
  {
    files: ['**/*.test.{js,jsx,ts,tsx}', 'vitest.setup.ts'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  }
);
