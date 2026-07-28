import './setup';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v2';
import { guardedEvent, sentryDsn } from './sentry';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { recordStat } from './stats';

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
    document: 'cards/{cardId}/comments/{commentId}',
    secrets: [sentryDsn],
  },
  guardedEvent(async (event) => {
    const before = event.data?.before;
    const after = event.data?.after;

    const created = !before?.exists && after?.exists;
    const deleted = before?.exists && !after?.exists;
    // An edit changes neither the count nor anything else here.
    if (!created && !deleted) return;

    const { cardId } = event.params;
    const cardRef = getFirestore().doc(`cards/${cardId}`);

    try {
      await cardRef.update({ commentCount: FieldValue.increment(created ? 1 : -1) });
    } catch (e) {
      // The card may have been deleted along with its comments, in which case
      // there is nothing to keep in step and this is not an error worth alerting on.
      logger.debug('commentCount update skipped', { cardId, error: String(e) });
    }

    // Usage counters. Only a NEW comment counts: a deletion is not negative
    // activity, and the day it was written is still the day the work happened.
    if (!created) return;

    // The board is not in this trigger's path — comments live under the card —
    // so it costs one read. At this volume that is cheaper and far clearer than
    // denormalising `boardId` onto every comment for a counter's benefit.
    const comment = after!.data()!;
    const card = await cardRef.get();
    await recordStat(
      (card.data()?.boardId as string) ?? '',
      // SERVER time, not the comment's own `createdAt`.
      //
      // `createdAt` is client-supplied and rules do not pin it — the create rule
      // lists it in `hasOnly` but never constrains its value — so a client can
      // write any number at all. Bucketing on it would let a caller place a
      // count on an arbitrary day, and worse, address an arbitrary month
      // document: `stats/{board}/months/9999-12` and as many more as it liked.
      // Server time also matches every other counter (`onCardWritten`, both
      // attachment paths, the delete cascade), and differs from the comment's
      // own timestamp by milliseconds in the normal case.
      Date.now(),
      { comments: 1 },
      (comment.authorUid as string) ?? '',
    );
  }),
);
