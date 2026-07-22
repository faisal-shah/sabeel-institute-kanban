/**
 * Shareable-link paths and the parser that turns an incoming link back into a
 * navigation target. Pure and platform-agnostic — the platform bits (where the
 * launch URL comes from, how a share sheet opens) live in ./deeplink and
 * ./share.
 *
 * A card link is `/c/{cardId}` — the card id ONLY. A card's board can change
 * (cross-board move reuses the same doc id, see bulkMoveToBoard), so baking the
 * board into the link would make a shared link go stale the moment the card
 * moves. The id never changes; the board is resolved live when the link opens.
 */

export type LinkTarget =
  | { kind: 'card'; cardId: string }
  | { kind: 'board'; boardId: string };

/** The path a card link points at. Prefix with an origin to make a full URL. */
export function cardPath(cardId: string): string {
  return `/c/${cardId}`;
}

/** Strip scheme+host and query/hash from a full URL or bare path → just the path. */
function toPath(input: string): string {
  const withoutOrigin = input.replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]*/i, '');
  const path = withoutOrigin.split(/[?#]/, 1)[0] ?? '';
  return path.startsWith('/') ? path : `/${path}`;
}

/**
 * Parse an incoming link (full https URL, custom-scheme URL, or bare path) into
 * a navigation target, or null when it is not one of ours. Generated links are
 * always https, so this is exercised by real shared links and by Android App
 * Links (v2); the raw `sabeelkanban://` dev form is not relied on here.
 */
export function parseLinkTarget(input: string): LinkTarget | null {
  const path = toPath(input).replace(/\/+$/, '');
  const card = path.match(/^\/c\/([A-Za-z0-9_-]+)$/);
  if (card) return { kind: 'card', cardId: card[1] };
  const board = path.match(/^\/b\/([A-Za-z0-9_-]+)$/);
  if (board) return { kind: 'board', boardId: board[1] };
  return null;
}
