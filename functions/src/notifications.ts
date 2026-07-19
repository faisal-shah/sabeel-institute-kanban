import './setup';
import { onDocumentCreated, onDocumentWritten } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions/v2';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import {
  ORG_TIMEZONE,
  addDays,
  notificationText,
  shouldNotify,
  todayInOrgTz,
  type NotifyEvent,
} from '@sabeel/shared';

/**
 * Notifications: an in-app inbox entry plus a push, for a deliberately small set
 * of events.
 *
 * Delivery is push AND inbox, never push alone. A push that is swiped away or
 * arrives while the phone is off is gone forever; the inbox means "she assigned
 * me something urgent" is always recoverable. The client can only mark entries
 * read — it cannot create or edit them, so the inbox cannot be forged.
 */

const db = () => getFirestore();

interface Recipient {
  uid: string;
  status?: string;
  prefs?: Partial<Record<NotifyEvent, boolean>>;
  mutedBoardIds?: string[];
  pushTokens?: string[];
  displayName?: string;
}

async function loadRecipients(uids: readonly string[]): Promise<Recipient[]> {
  const unique = [...new Set(uids)].filter(Boolean);
  if (unique.length === 0) return [];

  const snaps = await db().getAll(...unique.map((u) => db().doc(`users/${u}`)));
  return snaps
    .filter((s) => s.exists)
    .map((s) => ({
      uid: s.id,
      status: s.data()?.status as string | undefined,
      prefs: s.data()?.notifyPrefs ?? {},
      mutedBoardIds: (s.data()?.mutedBoardIds as string[]) ?? [],
      pushTokens: (s.data()?.pushTokens as string[]) ?? [],
      displayName: s.data()?.displayName as string | undefined,
    }));
}

async function nameOf(uid: string): Promise<string> {
  const snap = await db().doc(`users/${uid}`).get();
  return (snap.data()?.displayName as string) ?? 'Someone';
}

/**
 * Write the inbox entry and send the push. Preferences, board mutes, account
 * status and the never-notify-yourself rule are all applied by `shouldNotify`
 * in shared, which is unit-tested exhaustively.
 */
async function notify(params: {
  event: NotifyEvent;
  recipients: readonly Recipient[];
  actorUid: string;
  actorName: string;
  boardId: string;
  cardId?: string;
  cardTitle?: string;
}): Promise<void> {
  const text = notificationText({
    event: params.event,
    actorName: params.actorName,
    cardTitle: params.cardTitle,
  });

  const targets = params.recipients.filter((r) =>
    shouldNotify({
      event: params.event,
      recipientUid: r.uid,
      actorUid: params.actorUid,
      boardId: params.boardId,
      prefs: r.prefs,
      mutedBoardIds: r.mutedBoardIds,
      status: r.status,
    }),
  );
  if (targets.length === 0) return;

  const batch = db().batch();
  for (const r of targets) {
    batch.set(db().collection(`users/${r.uid}/notifications`).doc(), {
      type: params.event,
      boardId: params.boardId,
      ...(params.cardId ? { cardId: params.cardId } : {}),
      actorUid: params.actorUid,
      text,
      read: false,
      at: Date.now(),
    });
    batch.update(db().doc(`users/${r.uid}`), {
      unreadNotifCount: FieldValue.increment(1),
    });
  }
  await batch.commit();

  // Push is best-effort and must never fail the inbox write above: a device
  // token goes stale the moment someone reinstalls the app, and that is not a
  // reason to lose the notification.
  const tokens = targets.flatMap((r) => r.pushTokens ?? []);
  if (tokens.length === 0) return;

  try {
    await getMessaging().sendEachForMulticast({
      tokens,
      notification: { title: 'Sabeel Kanban', body: text },
      data: {
        boardId: params.boardId,
        ...(params.cardId ? { cardId: params.cardId } : {}),
      },
    });
  } catch (e) {
    logger.warn('push send failed (inbox entry was still written)', {
      error: String(e),
    });
  }
}

/** A comment: notifies mentioned people, and the card's assignees. */
export const onCommentCreated = onDocumentCreated(
  'boards/{boardId}/cards/{cardId}/comments/{commentId}',
  async (event) => {
    const data = event.data?.data();
    if (!data) return;

    const { boardId, cardId } = event.params;
    const authorUid = data.authorUid as string;
    const mentionUids = (data.mentionUids as string[]) ?? [];

    const card = await db().doc(`boards/${boardId}/cards/${cardId}`).get();
    const cardTitle = card.data()?.title as string | undefined;
    const assignees = (card.data()?.assigneeUids as string[]) ?? [];

    const actorName = await nameOf(authorUid);

    // A mention wins over the generic comment notification, so being both
    // mentioned and an assignee does not produce two pushes for one comment.
    const mentioned = await loadRecipients(mentionUids);
    await notify({
      event: 'mention',
      recipients: mentioned,
      actorUid: authorUid,
      actorName,
      boardId,
      cardId,
      cardTitle,
    });

    const others = assignees.filter((u) => !mentionUids.includes(u));
    await notify({
      event: 'commentOnMyCard',
      recipients: await loadRecipients(others),
      actorUid: authorUid,
      actorName,
      boardId,
      cardId,
      cardTitle,
    });
  },
);

/** Assignment and moves on a card someone owns. */
export const onCardNotify = onDocumentWritten(
  'boards/{boardId}/cards/{cardId}',
  async (event) => {
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    if (!after) return;

    const { boardId, cardId } = event.params;
    const actorUid = (after.updatedBy ?? after.createdBy ?? '') as string;
    if (!actorUid) return;

    const actorName = await nameOf(actorUid);
    const cardTitle = after.title as string | undefined;

    const beforeAssignees = (before?.assigneeUids as string[]) ?? [];
    const afterAssignees = (after.assigneeUids as string[]) ?? [];
    const newlyAssigned = afterAssignees.filter((u) => !beforeAssignees.includes(u));

    if (newlyAssigned.length > 0) {
      await notify({
        event: 'assigned',
        recipients: await loadRecipients(newlyAssigned),
        actorUid,
        actorName,
        boardId,
        cardId,
        cardTitle,
      });
    }

    // Default OFF: on an active board this fires constantly.
    if (before && before.columnId !== after.columnId) {
      await notify({
        event: 'myCardMoved',
        recipients: await loadRecipients(afterAssignees),
        actorUid,
        actorName,
        boardId,
        cardId,
        cardTitle,
      });
    }
  },
);

/** Admins hear about people waiting for approval. */
export const onUserPending = onDocumentCreated('users/{uid}', async (event) => {
  const data = event.data?.data();
  if (!data || data.status !== 'pending') return;

  const admins = await db().collection('users').where('role', '==', 'admin').get();
  const recipients = await loadRecipients(admins.docs.map((d) => d.id));

  await notify({
    event: 'newUserPending',
    recipients,
    // The new person is the "actor", so an admin signing themselves up is not
    // notified about their own arrival.
    actorUid: event.params.uid,
    actorName: (data.displayName as string) ?? 'Someone',
    boardId: '',
  });
});

/**
 * Due-soon reminders, once a day.
 *
 * 08:00 in the org timezone: early enough to act on, late enough not to be a
 * 3am buzz. Runs a collection-group query for cards due today or tomorrow and
 * notifies their assignees.
 */
export const dueSoonReminders = onSchedule(
  { schedule: '0 8 * * *', timeZone: ORG_TIMEZONE },
  async () => {
    const today = todayInOrgTz();
    const horizon = addDays(today, 1);

    const due = await db()
      .collectionGroup('cards')
      .where('archived', '==', false)
      .where('dueDate', '>=', today)
      .where('dueDate', '<=', horizon)
      .get();

    logger.info('due-soon sweep', { today, horizon, cards: due.size });

    for (const card of due.docs) {
      const assignees = (card.data().assigneeUids as string[]) ?? [];
      if (assignees.length === 0) continue;

      const boardId = card.ref.parent.parent?.id ?? '';
      await notify({
        event: 'dueSoon',
        recipients: await loadRecipients(assignees),
        // No human actor: a schedule is not a person, and using a real uid here
        // would suppress the reminder for whoever that was.
        actorUid: '__scheduler__',
        actorName: 'Sabeel Kanban',
        boardId,
        cardId: card.id,
        cardTitle: card.data().title as string | undefined,
      });
    }
  },
);
