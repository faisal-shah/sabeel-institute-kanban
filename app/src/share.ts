/**
 * Share a link — NATIVE (web sibling: share.web.ts).
 *
 * React Native's `Share` opens the Android system share sheet — WhatsApp, Google
 * Chat, SMS, everything. Android uses `message` (the `url` field is iOS-only, and
 * there is no iOS here), so the link goes in the text, where every messaging app
 * auto-links a bare URL into something tappable.
 */
import { Share } from 'react-native';

/**
 * The origin shared links point at. On native there is no address bar to read,
 * so this is the deployed Hosting domain — the same place an https card link
 * resolves. Kept in sync with firebase-config's authDomain by hand.
 */
export const WEB_ORIGIN = 'https://sabeel-institute-kanban.web.app';

export type ShareResult = 'shared' | 'copied' | 'unavailable';

export async function shareLink(url: string, title: string): Promise<ShareResult> {
  await Share.share({ message: `${title}\n${url}` });
  return 'shared';
}
