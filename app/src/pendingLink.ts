/**
 * The link the app was launched from, resolved once and handed out a single
 * time.
 *
 * `consumeInitialLink` returns the launch target on its FIRST call and null on
 * every call after, so navigating around later never re-triggers it. It is async
 * so it can await the native `getInitialURL`; on web the launch URL was already
 * captured synchronously at module load (see deeplink.web.ts), so it resolves
 * immediately. Awaited from the signed-in shell, which means a link followed
 * while signed out is honoured right after sign-in.
 */
import { getInitialLink } from './deeplink';
import { parseLinkTarget, type LinkTarget } from './links';

let resolved: Promise<LinkTarget | null> | null = null;
let consumed = false;

export async function consumeInitialLink(): Promise<LinkTarget | null> {
  if (!resolved) {
    resolved = getInitialLink().then((url) => (url ? parseLinkTarget(url) : null));
  }
  const target = await resolved;
  if (consumed) return null;
  consumed = true;
  return target;
}
