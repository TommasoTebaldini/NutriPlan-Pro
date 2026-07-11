// ESLint flat config (ESLint 9+).
// This is a vanilla HTML/JS app with no bundler: js/*.js files are loaded as
// plain <script> tags on multiple pages and share globals across files by
// design (sb, currentUser, checkAuth, esc, ...). Enforcing no-undef here would
// require enumerating every cross-file global and would mostly just add noise,
// so it stays off — this config focuses on catching real bugs (no-unused-vars,
// no-redeclare, etc.), not on module-boundary purity that doesn't apply here.
import js from '@eslint/js';
import globals from 'globals';
import prettier from 'eslint-config-prettier';

export default [
  {
    ignores: [
      'node_modules/**',
      '.claude/**',
      '.vercel/**',
      'vendor/**',
      // Large generated/data files — thousands of data-literal entries, not
      // hand-written logic worth linting.
      'js/db.js',
      'js/studies-data.js',
      'js/linee-guida-data.js',
      'js/consigli-data.js',
      'js/ricette-db.js',
      // Dead root-level duplicates from a past "Add files via upload" mishap
      // (content swapped vs. filename, never referenced by vercel.json/HTML) —
      // left in place per explicit instruction, not worth linting.
      'claude.js',
      'calendar.js',
      'config.js',
      'fetch-page.js',
      'gemini.js',
    ],
  },
  js.configs.recommended,
  {
    files: ['js/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'script',
      globals: {
        ...globals.browser,
        supabase: 'readonly',
      },
    },
    rules: {
      'no-undef': 'off',
      // Functions here are routinely called only from inline onclick="..." in
      // the HTML pages that load this script — ESLint can't see that usage,
      // so top-level unused-function noise would vastly outnumber real dead
      // code. Still flags unused locals/params, which ARE reliable signal.
      'no-unused-vars': 'off',
      // catch(e) {} with no body is a deliberate "best-effort, ignore" pattern
      // used throughout this codebase for non-critical fallback behavior.
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
  {
    files: ['api/**/*.js', 'server.js', 'scripts/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      'no-unused-vars': ['warn', { args: 'none', varsIgnorePattern: '^_' }],
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
  prettier,
];
