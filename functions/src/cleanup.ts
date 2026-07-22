import './setup';
import { onDocumentDeleted } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v2';
import { guardedEvent, sentryDsn } from './sentry';
import { getFirestore } from 'firebase-admin/firestore';

/**
 * Delete a card's `comments` and `activity` when the card itself is deleted.
 *
 * Firestore does NOT cascade: deleting `cards/{cardId}` leaves its subcollections
 * behind as orphans forever (unreadable — the rules resolve their board from the
 * now-missing card doc and deny). A hard delete is managers/admins only, but it
 * happens, and without this every deletion leaks its whole thread and history.
 *
 * `recursiveDelete` removes the (already-gone) card doc AND every descendant, so
 * it clears exactly the leftover subcollections. Idempotent: re-running on an
 * empty path is a no-op.
 */
export const onCardDeleted = onDocumentDeleted(
  { document: 'cards/{cardId}', secrets: [sentryDsn] },
  guardedEvent(async (event) => {
    const { cardId } = event.params;
    const db = getFirestore();
    const ref = db.doc(`cards/${cardId}`);
    // If a live card already exists at this path again, do NOT delete it. In
    // production card ids are random (addDoc), so a deleted id is never reused —
    // but this trigger runs asynchronously, and if a new card were ever created
    // at the same id before it fired, recursiveDelete would wrongly take the live
    // one and its subcollections with it. Only clean up a genuine orphan.
    if ((await ref.get()).exists) return;
    await db.recursiveDelete(ref);
    logger.info('cleaned up deleted card subcollections', { cardId });
  }),
);
