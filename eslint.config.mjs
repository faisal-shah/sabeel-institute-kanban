import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';

/**
 * `no-restricted-syntax` selectors, declared once and COMPOSED below.
 *
 * Flat config does not merge two configurations that set the same rule: the
 * last one matching a file replaces the earlier one outright. Two blocks each
 * setting `no-restricted-syntax` over `app/src/**` therefore silently disables
 * whichever is declared first, and `npm run lint` still passes — a green run
 * that means nothing. So every block below lists the full set that applies to
 * its files.
 */
const NO_HARDCODED_COLOR = [
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
];

/**
 * A scroller must SAY what it does with a tap while a field is focused.
 *
 * React Native's default — `keyboardShouldPersistTaps="never"` — makes a
 * ScrollView take the responder in the CAPTURE phase whenever any TextInput is
 * focused, so the control under the finger never fires and never even shows its
 * pressed state. The user sees a dead tap with nothing to explain it. It cost
 * the link dialog three taps over 3.5 seconds on a real phone, and it had
 * already cost `KeyboardScroll` the same bug once before.
 *
 * NO TEST HERE CAN CATCH IT: every e2e suite is Playwright on web, and this is
 * native responder behaviour. Lint is the only guard that sees it — which is
 * why the bar is "say something" rather than "say handled". `always` is a
 * legitimate answer for a scroller with no controls in it.
 */
const SCROLLER_MUST_ANSWER_TAPS = [
  {
    selector:
      'JSXOpeningElement[name.name=/^(ScrollView|FlatList|SectionList|KeyboardAwareScrollView)$/]:not(:has(JSXAttribute[name.name="keyboardShouldPersistTaps"]))',
    message:
      'Set keyboardShouldPersistTaps. At the default, a focused TextInput anywhere makes this scroller swallow the next tap on any control inside it — see the comment in components/Sheet.tsx. Use "handled" unless there is a reason not to.',
  },
];

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
    // Colour tokens everywhere in app/src except the module that defines them,
    // and — for the files that actually run on a device — the scroller rule.
    // Both selector sets are listed together because flat config REPLACES a
    // rule rather than merging it; see the note at the top of this file.
    files: ['app/src/**/*.{ts,tsx}'],
    ignores: ['app/src/theme/**', 'app/src/**/*.web.tsx'],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...NO_HARDCODED_COLOR,
        ...SCROLLER_MUST_ANSWER_TAPS,
      ],
    },
  },
  {
    // Web-only siblings: colour still applies; the scroller rule does not,
    // because `keyboardShouldPersistTaps` does nothing in a browser and an
    // inert prop is its own kind of debt.
    files: ['app/src/**/*.web.{ts,tsx}'],
    ignores: ['app/src/theme/**'],
    rules: {
      'no-restricted-syntax': ['error', ...NO_HARDCODED_COLOR],
    },
  },
);
