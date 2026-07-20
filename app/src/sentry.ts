import { USE_EMULATORS } from './env';
import * as Sentry from '@sentry/react-native';

/**
 * Error reporting — NATIVE. The web variant is sentry.web.ts.
 *
 * Reports to a SEPARATE Sentry project from web, so Android crashes triage on
 * their own releases and symbols rather than being interleaved with browser
 * errors that share none of their causes.
 *
 * The DSN comes from gitignored `app/.env.local`, inlined at bundle time;
 * without it everything here is a no-op, so a dev build never sends noise to the
 * production project.
 *
 * Release JS stacks are minified. Uploading source maps needs a
 * SENTRY_AUTH_TOKEN build step, which is deliberately NOT wired: that token is a
 * real secret (unlike the DSN), and `@sentry/wizard` — which would set it up —
 * rewrites committed native files and metro config. Events, messages, tags and
 * user ids all arrive without it.
 */
/**
 * Reporting is OFF whenever the app is pointed at the emulators, even though a
 * DSN is present in `.env.local`.
 *
 * Without this, every local run and every e2e pass files fake errors into the
 * production Sentry project — burning a 5K/month event quota on noise and
 * training everyone to ignore the issue stream. It also caused a concrete
 * failure: the SDK wraps fetch for breadcrumbs and beacons to an ingest host
 * the test environment cannot reach, which was enough to stall a sign-in flow
 * and abort the suite.
 */
const DSN = USE_EMULATORS ? undefined : process.env.EXPO_PUBLIC_SENTRY_DSN_NATIVE;

let initialised = false;

export function initErrorReporting(): void {
  if (initialised || !DSN) return;
  initialised = true;
  Sentry.init({ dsn: DSN, tracesSampleRate: 0 });
}

export function captureError(error: unknown, context?: Record<string, unknown>): void {
  if (!DSN) {
    // Without a DSN this is still the ONE place errors are funnelled, so a
    // developer sees them in the console rather than nowhere.
    console.warn('[error]', error, context ?? '');
    return;
  }
  Sentry.captureException(error, { extra: context });
}

/**
 * Attach the signed-in user to events.
 *
 * **Uid only — never email or name.** The uid correlates with the `users`
 * collection when someone needs to trace a report, which is all triage
 * requires; putting staff email addresses into a third-party service is a
 * disclosure this app has no reason to make. The two seams must not diverge on
 * what they disclose.
 */
export function setErrorUser(uid: string | null): void {
  if (!DSN) return;
  Sentry.setUser(uid ? { id: uid } : null);
}

