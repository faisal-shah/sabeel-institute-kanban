import './setup';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import type { Role, UserStatus } from '@sabeel/shared';
import { canManageBoards } from '@sabeel/shared';

/**
 * Removing someone from a board is a CALLABLE, not a plain client write.
 *
 * Board membership and card assignment must move together. A card is readable by
 * anyone in its `assigneeUids` — that rule is what makes the cross-board "My
 * Work" collection-group query legal without a per-card parent lookup (see
 * docs/PRODUCT_BRIEF.md § Cross-board "My Work"). So a member removed from a
 * board while still assigned to its cards would KEEP read access to them, which
 * is precisely the leak the removal was meant to close.
 *
 * Doing both halves in one server-side batch means they cannot drift.
 */
export const removeBoardMember = onCall(async (request) => {
  const auth = request.auth;
  if (!auth) throw new HttpsError('unauthenticated', 'Sign in first.');

  const actor = {
    role: (auth.token.role ?? 'member') as Role,
    status: (auth.token.status ?? 'pending') as UserStatus,
  };
  if (!canManageBoards(actor)) {
    throw new HttpsError(
      'permission-denied',
      'Only managers and admins can change who is on a board.',
    );
  }

  const boardId = request.data?.boardId;
  const uid = request.data?.uid;
  if (typeof boardId !== 'string' || !boardId) {
    throw new HttpsError('invalid-argument', 'A boardId is required.');
  }
  if (typeof uid !== 'string' || !uid) {
    throw new HttpsError('invalid-argument', 'A uid is required.');
  }

  const db = getFirestore();
  const boardRef = db.doc(`boards/${boardId}`);
  const board = await boardRef.get();
  if (!board.exists) throw new HttpsError('not-found', 'No such board.');

  // Cards assigned to the person being removed. Batched with the membership
  // change so there is no window in which they are unassigned but still a
  // member, or removed but still assigned.
  const assigned = await db
    .collection(`boards/${boardId}/cards`)
    .where('assigneeUids', 'array-contains', uid)
    .get();

  const batch = db.batch();
  batch.update(boardRef, {
    memberUids: FieldValue.arrayRemove(uid),
    // The denormalised profile goes with the membership — leaving it behind
    // would keep a departed colleague in every assignee picker.
    [`memberProfiles.${uid}`]: FieldValue.delete(),
  });
  for (const card of assigned.docs) {
    batch.update(card.ref, { assigneeUids: FieldValue.arrayRemove(uid) });
  }
  await batch.commit();

  logger.info('Removed board member', {
    boardId,
    uid,
    actorUid: auth.uid,
    unassignedCards: assigned.size,
  });

  return { ok: true, unassignedCards: assigned.size };
});

/**
 * How many cards a removal would unassign, so the UI can warn before doing it.
 * "Remove Sara?" and "Remove Sara, unassigning her from 12 cards?" are different
 * questions.
 */
export const countMemberAssignments = onCall(async (request) => {
  const auth = request.auth;
  if (!auth) throw new HttpsError('unauthenticated', 'Sign in first.');

  const actor = {
    role: (auth.token.role ?? 'member') as Role,
    status: (auth.token.status ?? 'pending') as UserStatus,
  };
  if (!canManageBoards(actor)) {
    throw new HttpsError('permission-denied', 'Managers and admins only.');
  }

  const boardId = request.data?.boardId;
  const uid = request.data?.uid;
  if (typeof boardId !== 'string' || typeof uid !== 'string') {
    throw new HttpsError('invalid-argument', 'boardId and uid are required.');
  }

  const assigned = await getFirestore()
    .collection(`boards/${boardId}/cards`)
    .where('assigneeUids', 'array-contains', uid)
    .count()
    .get();

  return { count: assigned.data().count };
});
