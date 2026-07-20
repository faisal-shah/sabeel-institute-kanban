import { captureError } from './sentry';

/**
 * Turn a thrown value into a message for the user — and report it.
 *
 * Every screen has a `run()` that catches, shows a banner, and moves on. That is
 * right for the user and wrong for us: it meant a failure the user SAW never
 * reached Sentry. A clear-the-due-date bug sat in production, visible on screen,
 * with nothing in the issue stream (2026-07-19).
 *
 * Anything a user is told about is by definition worth knowing about, so the
 * capture happens here rather than being remembered at eight call sites.
 */
export function toUserMessage(e: unknown, source: string): string {
  captureError(e, { source });
  return e instanceof Error ? e.message : String(e);
}
