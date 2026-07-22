/**
 * Share a link — WEB (native sibling: share.ts).
 *
 * Prefer the Web Share API (the real share sheet on mobile browsers and many
 * desktops); fall back to copying the link to the clipboard, which is the
 * sensible desktop behaviour when no share sheet exists. A cancelled share sheet
 * is not an error — the user changed their mind.
 */

/** The origin shared links point at. On web, whatever host we are served from. */
export const WEB_ORIGIN =
  typeof window !== 'undefined' ? window.location.origin : 'https://sabeel-institute-kanban.web.app';

export type ShareResult = 'shared' | 'copied' | 'unavailable';

export async function shareLink(url: string, title: string): Promise<ShareResult> {
  const nav = typeof navigator !== 'undefined' ? navigator : undefined;
  if (nav?.share) {
    try {
      await nav.share({ title, url });
      return 'shared';
    } catch {
      // AbortError = the user dismissed the sheet. Nothing shared, nothing wrong.
      return 'shared';
    }
  }
  if (nav?.clipboard?.writeText) {
    await nav.clipboard.writeText(url);
    return 'copied';
  }
  return 'unavailable';
}
