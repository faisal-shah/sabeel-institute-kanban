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
 * Release JS stacks are minified, so source maps and debug symbols are uploaded
 * at build time — Android from `app/android/app/build.gradle`, iOS through the
 * `@sentry/react-native/expo` plugin. Both read SENTRY_AUTH_TOKEN from the build
 * environment (see docs/SECRETS.md), and the Android side is GATED on it: no
 * token, no Sentry Gradle tasks at all, so a fresh clone or CI builds exactly
 * what it built before. Events, messages, tags and user ids all arrive either
 * way; without the upload the frames are simply minified.
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

export function captureError(
  error: unknown,
  context?: Record<string, unknown>,
  // `warning` for things worth recording but not paging anyone about — e.g. a
  // slow-but-successful write (see slowWrites.ts). Still an exception, so it
  // groups by stack rather than fragmenting per message; only the level differs.
  level: 'error' | 'warning' = 'error',
): void {
  if (!DSN) {
    // Without a DSN this is still the ONE place errors are funnelled, so a
    // developer sees them in the console rather than nowhere.
    console.warn('[error]', error, context ?? '');
    return;
  }
  Sentry.captureException(error, { level, extra: context });
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

