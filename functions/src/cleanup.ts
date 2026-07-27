import './setup';
import { onDocumentDeleted } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v2';
import { guardedEvent, sentryDsn } from './sentry';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

/**
 * Delete a card's `comments` and `activity` when the card itself is deleted, and
 * unlink any subtasks that pointed at it.
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

    // The card's attachment OBJECTS. `recursiveDelete` above removes their
    // documents, but Firestore knows nothing about the bucket.
    //
    // A prefix sweep rather than a per-document trigger, because it also
    // catches bytes from an upload whose document never landed — those are
    // invisible and billable forever, and nothing else would ever find them.
    // (A per-document trigger would fire; `recursiveDelete` deletes documents
    // individually, which is why onCommentWritten carries a "the card may have
    // been deleted" tolerance. Two mechanisms would race and double-delete.)
    //
    // The TRAILING SLASH is load-bearing: without it a sibling card whose id
    // merely starts with these characters would be swept too. And this sits
    // AFTER the resurrection guard above, or a re-created id loses its files.
    //
    // Archiving a card keeps its attachments — only a permanent delete reaches
    // here. Worth stating, because "the files disappeared" is otherwise a
    // plausible-sounding bug report.
    try {
      await getStorage()
        .bucket()
        .deleteFiles({ prefix: `cards/${cardId}/attachments/` });
    } catch (e) {
      // `deleteFiles` throws on the first failure and is not atomic. A Storage
      // hiccup must never block the Firestore cleanup below, and the daily
      // sweep is not the mechanism that would recover these — so log loudly
      // rather than failing the trigger.
      logger.warn('attachment objects not cleaned up', { cardId, error: String(e) });
    }

    // Unlink the deleted card's subtasks. `parentId` lives on the CHILD, so
    // nothing else would ever clear it — the children would keep pointing at a
    // card that no longer exists. The UI already degrades gracefully (an
    // unresolvable parent renders nothing), but leaving the field set means the
    // link silently reappears if that id is ever reused, and it quietly excludes
    // those cards from every subtask picker, since `canBeSubtaskOf` refuses a
    // card that already has a parent. So they would be unlinkable forever.
    //
    // `where('parentId','==',id)` needs no composite index — the single-field
    // index Firestore maintains automatically covers it.
    const children = await db
      .collection('cards')
      .where('parentId', '==', cardId)
      .get();

    // One update per child, NOT a batch, and each failure tolerated.
    //
    // `update()` on a document that no longer exists fails with NOT_FOUND, and a
    // batch is atomic — so one child deleted in the window BETWEEN this query and
    // the commit would take every other unlink down with it, leaving those cards
    // dangling and permanently unlinkable (the picker refuses an already-parented
    // card). That is the exact state this sweep exists to prevent, and the unlinks
    // are independent, so atomicity buys nothing here.
    //
    // To be clear about the size of the risk: the ordinary case is already safe.
    // Deleting a parent together with its subtasks goes through `bulkDelete`, one
    // batch, so the children are gone BEFORE this query runs and simply are not
    // returned — measured, not assumed. The window this closes is only the narrow
    // one where a child is deleted concurrently by someone else mid-sweep. Cheap
    // insurance against a failure whose signature would be silent and permanent.
    const results = await Promise.allSettled(
      children.docs.map((child) =>
        child.ref.update({ parentId: FieldValue.delete() }),
      ),
    );
    const failed = results.filter((r) => r.status === 'rejected').length;

    logger.info('cleaned up deleted card', {
      cardId,
      unlinkedSubtasks: children.size - failed,
      // Expected to be non-zero only when a child was deleted concurrently.
      skippedSubtasks: failed,
    });
  }),
);
