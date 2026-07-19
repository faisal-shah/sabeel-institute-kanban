import * as Sentry from '@sentry/node';
import { defineSecret } from 'firebase-functions/params';
import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';

/**
 * Error reporting for Cloud Functions.
 *
 * Ported from the sibling time tracker deliberately — the same three properties
 * are what make it useful there, and each is easy to get wrong:
 *
 *  1. The DSN is a **Secret Manager secret**, not an env var in the repo. Bind
 *     it with `secrets: [sentryDsn]` on any function whose failures matter.
 *  2. `HttpsError` is EXCLUDED. Those are expected domain outcomes —
 *     unauthenticated, permission-denied, invalid-argument — and they already
 *     reach the caller. Reporting them would bury real defects under a stream of
 *     people mistyping things.
 *  3. Events are **flushed before returning**. A serverless instance can be
 *     frozen the moment the handler resolves, so an unflushed event may never
 *     leave the machine. This is the one that fails silently in production and
 *     looks like "Sentry isn't working".
 */
export const sentryDsn = defineSecret('SENTRY_DSN');

let initialised = false;

/** Initialise once, lazily, from a DSN supplied at call time. */
export function ensureSentry(dsn: string | undefined): boolean {
  if (initialised) return true;
  if (!dsn) return false;
  Sentry.init({
    dsn,
    tracesSampleRate: 0,
    environment: process.env.NODE_ENV ?? 'development',
  });
  initialised = true;
  return true;
}

export { Sentry };

/** Report an UNEXPECTED error. Expected HttpsErrors are not defects. */
export async function reportError(e: unknown): Promise<void> {
  if (e instanceof HttpsError) return;
  if (ensureSentry(process.env.SENTRY_DSN)) {
    Sentry.captureException(e);
    await Sentry.flush(2000).catch(() => undefined);
  }
}

/** Wrap a callable handler: unexpected failures reach Sentry, then rethrow. */
export function guarded<Req, Res>(
  fn: (req: CallableRequest<Req>) => Promise<Res>,
): (req: CallableRequest<Req>) => Promise<Res> {
  return async (req) => {
    try {
      return await fn(req);
    } catch (e) {
      await reportError(e);
      throw e;
    }
  };
}
