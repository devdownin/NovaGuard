import js from '@eslint/js';
import globals from 'globals';

export default [
  {
    ignores: ['node_modules/**', 'playwright-report/**', 'test-results/**']
  },

  /* Browser sources. Plain scripts (no bundler): each file is an IIFE that
     hangs one namespace off `window`, so those namespaces are read as globals
     across files. */
  {
    files: ['*.js', 'ds/**/*.js'],
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: 'script',
      globals: {
        ...globals.browser,
        Nocturne: 'readonly',
        Support: 'readonly',
        IOSFrame: 'readonly',
        Sentinelle: 'readonly'
      }
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': ['error', { args: 'after-used' }],
      'no-var': 'off',
      eqeqeq: ['error', 'smart'],
      'no-implicit-globals': 'error',
      curly: ['error', 'multi-line'],
      semi: ['error', 'always']
    }
  },

  /* Server code: Node ES modules. */
  {
    files: ['server/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: globals.node
    },
    rules: {
      ...js.configs.recommended.rules,
      eqeqeq: ['error', 'smart'],
      curly: ['error', 'multi-line'],
      semi: ['error', 'always']
    }
  },

  /* Playwright specs and config run in Node as ES modules. */
  {
    files: ['tests/**/*.mjs', 'playwright.config.mjs', 'eslint.config.mjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      /* Specs run in Node, but page.evaluate() callbacks are browser code. */
      globals: { ...globals.node, ...globals.browser }
    },
    rules: {
      ...js.configs.recommended.rules,
      semi: ['error', 'always']
    }
  }
];
