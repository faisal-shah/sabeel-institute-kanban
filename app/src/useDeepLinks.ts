/**
 * Open shared links once the user is active.
 *
 * Mounted from the signed-in shell, so the access gate has already run: a link
 * followed while signed out lands here right after sign-in, with the launch URL
 * still captured. A card link resolves its board live (findCardBoard) because a
 * card's board can change but its id cannot; when the card is gone or the
 * recipient is not on its board, we say so rather than opening nothing.
 *
 * Navigation goes through nav's module-level `push` directly, so this effect has
 * no reactive dependencies and runs exactly once per signed-in session.
 */
import { useEffect } from 'react';
import { push } from './nav';
import { consumeInitialLink } from './pendingLink';
import { subscribeLinks } from './deeplink';
import { parseLinkTarget, type LinkTarget } from './links';
import { findCardBoard } from './cards';
import { notifyUser } from './alert';

export function useDeepLinks(): void {
  useEffect(() => {
    let cancelled = false;

    const open = async (target: LinkTarget) => {
      if (target.kind === 'board') {
        push({ name: 'board', boardId: target.boardId });
        return;
      }
      const boardId = await findCardBoard(target.cardId);
      if (cancelled) return;
      if (boardId) {
        push({ name: 'card', boardId, cardId: target.cardId });
      } else {
        notifyUser(
          'Card unavailable',
          "This card may have been deleted, or you're not a member of its board.",
        );
      }
    };

    void consumeInitialLink().then((target) => {
      if (target && !cancelled) void open(target);
    });

    // Native only: a link opened while the app is already running.
    const unsubscribe = subscribeLinks((url) => {
      const target = parseLinkTarget(url);
      if (target) void open(target);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);
}
