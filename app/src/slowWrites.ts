import { captureError } from './sentry';

/**
 * Time a mutation, and report the slow ones.
 *
 * A comment post took roughly FOURTEEN seconds on a real phone. That is not
 * normal for Firestore — a local write should apply immediately and the promise
 * should settle shortly after the server acknowledges — so the honest position
 * is that we do not yet know where the time went, and guessing at causes
 * (token refresh, long-polling reconnect, a cold connection after the app was
 * backgrounded) is not the same as measuring.
 *
 * This measures. Anything past the threshold is reported with its duration and
 * label, so the next slow write in production tells us WHICH action and HOW
 * long instead of relying on someone happening to film it.
 *
 * Deliberately not a console log: the whole problem is that this happens on
 * someone else's phone.
 */
const SLOW_MS = 3000;

export async function timed<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const started = Date.now();
  try {
    return await fn();
  } finally {
    const ms = Date.now() - started;
    if (ms >= SLOW_MS) {
      captureError(new Error(`Slow write: ${label} took ${ms}ms`), {
        source: 'slowWrite',
        label,
        ms,
      });
    }
  }
}
