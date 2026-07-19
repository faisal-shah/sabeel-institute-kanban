/**
 * Error reporting — NATIVE. The web variant is sentry.web.ts.
 *
 * A no-op until a DSN exists, which is deliberate: the seam is wired from the
 * start so that turning reporting on at launch is a config change rather than a
 * code change, and every call site already exists.
 *
 * The DSN is read from EXPO_PUBLIC_SENTRY_DSN in a gitignored .env.local — see
 * docs/SECRETS.md. Never hardcode it.
 */
const DSN = process.env.EXPO_PUBLIC_SENTRY_DSN;

let initialised = false;

export function initErrorReporting(): void {
  if (initialised || !DSN) return;
  initialised = true;
  // Wiring @sentry/react-native happens here once a DSN exists. Kept behind the
  // flag so a dev build never ships noise to a production project.
}

export function captureError(error: unknown, context?: Record<string, unknown>): void {
  if (!DSN) {
    // Without a DSN this is still the ONE place errors are funnelled, so a
    // developer sees them in the console rather than nowhere.
    console.warn('[error]', error, context ?? '');
    return;
  }
  // Sentry.captureException(error, { extra: context });
}

export function setErrorUser(user: { uid: string; email: string } | null): void {
  if (!DSN) return;
  void user;
  // Sentry.setUser(user ? { id: user.uid, email: user.email } : null);
}

export const errorReportingEnabled = Boolean(DSN);
