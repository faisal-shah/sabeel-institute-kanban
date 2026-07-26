import './setup';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v2';
import { guardedEvent, sentryDsn } from './sentry';
import { getFirestore } from 'firebase-admin/firestore';
import { diffCard, type CardSnapshot } from '@sabeel/shared';

/**
 * Card history, written by the server so it cannot be forged.
 *
 * Clients have no write access to `activity` at all (see firestore.rules), which
 * is what makes "Sara moved this to Done" trustworthy. The actor is taken from
 * the card's own `updatedBy`, which rules require to match the writer.
 *
 * The diffing itself lives in @sabeel/shared and is tested exhaustively there —
 * notably that a rank-only change (a reorder within a column) produces NO entry.
 */
export const onCardWritten = onDocumentWritten(
  { document: 'cards/{cardId}', secrets: [sentryDsn] },
  guardedEvent(async (event) => {
    const before = (event.data?.before?.data() ?? null) as CardSnapshot | null;
    const after = (event.data?.after?.data() ?? null) as CardSnapshot | null;

    const entries = diffCard(before, after);
    if (entries.length === 0) return;

    const { cardId } = event.params;
    const boardId = (after?.boardId ?? before?.boardId ?? '') as string;
    const actorUid = (after?.updatedBy ?? after?.createdBy ?? 'unknown') as string;
    const at = Date.now();

    const db = getFirestore();
    const batch = db.batch();
    for (const entry of entries) {
      const ref = db.collection(`cards/${cardId}/activity`).doc();
      batch.set(ref, {
        type: entry.type,
        actorUid,
        at,
        // Firestore rejects undefined, so only set what exists.
        ...(entry.from !== undefined ? { from: entry.from } : {}),
        ...(entry.to !== undefined ? { to: entry.to } : {}),
      });

      // A subtask link is the one change that is ALSO news on another card.
      //
      // `parentId` lives on the child, so the diff only ever sees the child —
      // but you link a subtask while looking at the PARENT, and a history that
      // says nothing where the action was taken reads as the action not being
      // recorded. So mirror it: the parent gets its own entry, pointing back at
      // the child. Both are trigger-written, so neither can be forged.
      if (entry.type === 'subtaskOf') {
        for (const [otherId, to] of [
          [entry.to, cardId],
          [entry.from, undefined],
        ] as const) {
          if (!otherId) continue;
          batch.set(db.collection(`cards/${otherId}/activity`).doc(), {
            type: 'subtask',
            actorUid,
            at,
            ...(to !== undefined ? { to } : { from: cardId }),
          });
        }
      }
    }

    try {
      await batch.commit();
    } catch (e) {
      // History is valuable but never worth failing a user's write over — the
      // card change itself has already committed by the time this runs.
      logger.warn('activity write failed', { boardId, cardId, error: String(e) });
    }
  }),
);
