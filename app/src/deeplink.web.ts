/**
 * Where an incoming link comes from — WEB (native sibling: deeplink.ts).
 *
 * The browser IS the delivery mechanism: opening a shared link is a full page
 * load, so the launch URL is simply `window.location`, captured at module load
 * (before any sign-in navigation can rewrite it) and immutable thereafter. There
 * is nothing to subscribe to at runtime — a second link is another page load.
 */
const launchUrl =
  typeof window !== 'undefined' ? window.location.pathname + window.location.search : null;

export function getInitialLink(): Promise<string | null> {
  return Promise.resolve(launchUrl);
}

export function subscribeLinks(_cb: (url: string) => void): () => void {
  return () => {};
}
