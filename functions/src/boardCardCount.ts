import './setup';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v2';
import { guardedEvent, sentryDsn } from './sentry';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

/**
 * Keeps `activeCardCount` on each board — the number of NON-archived cards — in
 * step, so the Boards list can show it without counting cards per board on every
 * render. Denormalised for the same reason as a card's `commentCount`, and
 * maintained by a trigger so no client is ever trusted with it.
 *
 * A card counts toward board B exactly when it EXISTS, is not archived, and its
 * `boardId` is B. Computing that "active board" for the before and after states
 * makes one delta cover every case: create (before absent), archive/unarchive
 * (active-ness flips), a cross-board move (boardId flips), and delete (after
 * absent). `FieldValue.increment` is atomic, so concurrent writes both land.
 */
export const onCardBoardCount = onDocumentWritten(
  { document: 'cards/{cardId}', secrets: [sentryDsn] },
  guardedEvent(async (event) => {
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();

    const from = before && !before.archived ? (before.boardId as string) : null;
    const to = after && !after.archived ? (after.boardId as string) : null;
    if (from === to) return; // nothing changed a board's active count

    const db = getFirestore();
    const bump = async (boardId: string | null, delta: number) => {
      if (!boardId) return;
      try {
        await db
          .doc(`boards/${boardId}`)
          .update({ activeCardCount: FieldValue.increment(delta) });
      } catch (e) {
        // Boards archive rather than hard-delete, so the board should always be
        // here; if it somehow isn't, there is nothing to keep in step.
        logger.debug('activeCardCount update skipped', { boardId, error: String(e) });
      }
    };

    await bump(from, -1);
    await bump(to, 1);
  }),
);
