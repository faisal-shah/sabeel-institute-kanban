import { defineConfig } from 'vitest/config';

/**
 * Unit tests for the app's PURE logic — stores and helpers, not components.
 *
 * `app/` had no test runner at all, so `src/**\/*.test.ts` sat on disk and never
 * executed: a file that looks like coverage and is not, which is worse than
 * having none. Node environment and `.ts` only, deliberately — anything
 * importing `react-native` needs a transform this does not set up, and the
 * component surface is covered by the Playwright suites and by looking at
 * screenshots. Keep that boundary: if a test here needs a renderer, it belongs
 * in an e2e suite instead.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
