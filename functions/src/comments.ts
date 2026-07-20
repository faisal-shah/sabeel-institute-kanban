import './setup';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v2';
import { guardedEvent, sentryDsn } from './sentry';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

/**
 * Keeps `commentCount` on the card in step with its comments subcollection.
 *
 * The count is denormalised because the card face shows it, and counting a
 * subcollection per card would be a query per card per render. A trigger keeps
 * it honest without the client ever being trusted to maintain it — a client that
 * could write the count could also lie about it, and rules have no way to check.
 *
 * `FieldValue.increment` rather than a read-modify-write: two comments posted at
 * the same moment must both be counted, and increment is atomic on the server.
 */
export const onCommentWritten = onDocumentWritten(
  {
    document: 'boards/{boardId}/cards/{cardId}/comments/{commentId}',
    secrets: [sentryDsn],
  },
  guardedEvent(async (event) => {
    const before = event.data?.before;
    const after = event.data?.after;

    const created = !before?.exists && after?.exists;
    const deleted = before?.exists && !after?.exists;
    // An edit changes neither the count nor anything else here.
    if (!created && !deleted) return;

    const { boardId, cardId } = event.params;
    const cardRef = getFirestore().doc(`boards/${boardId}/cards/${cardId}`);

    try {
      await cardRef.update({ commentCount: FieldValue.increment(created ? 1 : -1) });
    } catch (e) {
      // The card may have been deleted along with its comments, in which case
      // there is nothing to keep in step and this is not an error worth alerting on.
      logger.debug('commentCount update skipped', { boardId, cardId, error: String(e) });
    }
  }),
);
