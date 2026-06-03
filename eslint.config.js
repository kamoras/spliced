import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';

export default [
  { ignores: ['dist/**', 'node_modules/**'] },
  js.configs.recommended,

  // Shared language options
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },

  // React app code (browser). Accessibility rules are enforced here.
  {
    files: ['src/**/*.{js,jsx}'],
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
      'api/**/*.js',
      'scripts/**/*.{js,mjs}',
      'vite.config.js',
      'eslint.config.js',
    ],
    languageOptions: { sourceType: 'module', globals: globals.node },
  },

  // Tests run under Vitest (jsdom): both browser and node globals available.
  {
    files: ['**/*.test.{js,jsx}'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
];
