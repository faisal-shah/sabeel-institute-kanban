/**
 * Error reporting — WEB. See sentry.ts for the native variant and the rationale.
 *
 * Separate seams because the SDKs differ (@sentry/react vs @sentry/react-native)
 * even though the interface this app uses is identical.
 */
const DSN = process.env.EXPO_PUBLIC_SENTRY_DSN;

let initialised = false;

export function initErrorReporting(): void {
  if (initialised || !DSN) return;
  initialised = true;
  // Wiring @sentry/react happens here once a DSN exists.
}

export function captureError(error: unknown, context?: Record<string, unknown>): void {
  if (!DSN) {
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
