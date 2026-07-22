/**
 * Where an incoming link comes from — NATIVE (web sibling: deeplink.web.ts).
 *
 * `Linking.getInitialURL` is the URL the app was cold-launched from; the `url`
 * event fires when a link is opened while the app is already running. In v1 the
 * app can only receive its own `sabeelkanban://` scheme (useful in dev); https
 * links start opening the installed app once Android App Links are registered
 * (v2). Until then this is dormant but correct — getInitialURL is null on a
 * normal launch, and the Share button (which sends an https link) is the part
 * that matters on native today.
 */
import { Linking } from 'react-native';

export function getInitialLink(): Promise<string | null> {
  return Linking.getInitialURL();
}

export function subscribeLinks(cb: (url: string) => void): () => void {
  const sub = Linking.addEventListener('url', (e) => cb(e.url));
  return () => sub.remove();
}
