import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      // Any exported web bundle, however it is named. Linting minified bundle
      // output produces thousands of meaningless errors.
      '**/dist-web*/**',
      '**/lib/**',
      '**/build/**',
      '**/coverage/**',
      '**/.expo/**',
      'app/android/**',
      'migration/**',
      '**/*.config.js',
      '**/*.config.mjs',
      '**/*.config.cjs',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['app/**/*.{ts,tsx}'],
    languageOptions: {
      globals: {
        ...globals.browser,
        __DEV__: 'readonly',
      },
    },
  },
  {
    // Playwright scripts run in Node, but the bodies passed to page.evaluate()
    // execute inside the browser, so both global sets are legitimate here.
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
  },
  {
    // The FCM service worker runs in the Service Worker global scope, not a
    // page: `self`, `clients`, `importScripts`, and the compat `firebase` global
    // it importScripts are all legitimate there, none of them page globals.
    files: ['app/public/firebase-messaging-sw.js'],
    languageOptions: {
      globals: { ...globals.serviceworker, firebase: 'readonly' },
    },
  },
  {
    // Hooks correctness matters more than usual here: useLiveQuery's whole
    // safety property is that its state resets when its dependencies change, so
    // a wrong dependency array reintroduces exactly the stale-data bug the
    // module exists to prevent.
    files: ['app/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  {
    // Live Firestore subscriptions must go through useLiveQuery/useLiveDoc, which
    // reset state when inputs change and clear on error. Hand-rolled onSnapshot
    // state is how the sibling time-tracker project showed one week's entries
    // under another on a slow connection — see docs/INHERITED-STACK.md lesson 5.
    // Kanban makes this sharper: optimistic card moves reconciling against server
    // snapshots are exactly that bug's shape.
    files: ['app/src/**/*.{ts,tsx}'],
    ignores: ['app/src/liveQuery.ts', 'app/src/session.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'firebase/firestore',
              importNames: ['onSnapshot'],
              message:
                'Subscribe via useLiveQuery/useLiveDoc (src/liveQuery.ts) — they reset on input change and clear on error. See docs/INHERITED-STACK.md lesson 5.',
            },
          ],
        },
      ],
    },
  },
  {
    // Every color must come from a semantic theme token, so a hardcoded literal
    // is an error everywhere except the token module that defines them. The app
    // is a single light theme (dark mode was removed 2026-07-21), but routing all
    // color through tokens is what keeps the palette coherent and changeable from
    // one place — and it caught the legibility bugs the colour-scheme pass found.
    files: ['app/src/**/*.{ts,tsx}'],
    ignores: ['app/src/theme/**'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "Literal[value=/^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/]",
          message:
            'Hardcoded color. Use a semantic token from src/theme (e.g. t.bg.surface, t.text.muted) so the palette stays in one place.',
        },
        {
          selector: "Literal[value=/^(?:rgb|rgba|hsl|hsla)\\(/]",
          message:
            'Hardcoded color. Use a semantic token from src/theme so the palette stays in one place.',
        },
      ],
    },
  },
);
