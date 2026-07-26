import './setup';
import { onDocumentCreated, onDocumentWritten } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions/v2';
import { guardedEvent, sentryDsn } from './sentry';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import {
  ORG_TIMEZONE,
  PUSH_CHANNEL_ID,
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
      displayName: s.data()?.displayName as string | undefined,
    }));
}

/**
 * Is this board archived?
 *
 * Read every time, deliberately NOT memoised in a module-level map. Function
 * instances are reused between invocations, so such a cache outlives the call:
 * archive a board, restore it, and a warm instance would go on suppressing its
 * notifications with nothing to show why. One extra document read is a small
 * price for a check that cannot go stale.
 *
 * A missing board reads as NOT archived — better a stray notification than a
 * silent hole if a board doc is briefly unreadable.
 */
async function boardIsArchived(boardId: string): Promise<boolean> {
  const snap = await db().doc(`boards/${boardId}`).get();
  return snap.exists && snap.data()?.archived === true;
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
  // An ARCHIVED board is put away, and nothing on it should still be buzzing
  // people's phones. Checked here, in the one place every notification passes
  // through, rather than in each trigger — a new caller then inherits it instead
  // of having to remember it. `newUserPending` carries no board and is unrelated
  // to any, so an empty boardId skips the lookup rather than failing on it.
  if (params.boardId && (await boardIsArchived(params.boardId))) return;

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

  // The inbox id is kept per recipient because the push carries it: tapping a
  // notification marks THAT entry read, so acting on a push takes the badge down
  // like acting in the app does. Without it someone taps the push, deals with
  // the card, and Alerts still insists there is 1 unread.
  const batch = db().batch();
  const notifIdByUid = new Map<string, string>();
  for (const r of targets) {
    const ref = db().collection(`users/${r.uid}/notifications`).doc();
    notifIdByUid.set(r.uid, ref.id);
    batch.set(ref, {
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
  // Tokens live in a SUBCOLLECTION keyed by the token itself, not an array on
  // the user doc. Devices register and unregister independently, and an array
  // field makes that a read-modify-write race between two phones; a document per
  // token cannot collide, and rules can grant a user write access to their own
  // tokens without opening up the rest of their user document.
  const tokenSnaps = await Promise.all(
    targets.map((r) => db().collection(`users/${r.uid}/pushTokens`).get()),
  );

  // One message per DEVICE, not one multicast: `sendEachForMulticast` takes a
  // single payload for every token, and the payload now has to differ per
  // recipient because it carries that person's own inbox id. Keep the owning ref
  // beside each message — a failed send has to be traced back to the token
  // document that has to be deleted.
  const sends = targets.flatMap((r, i) =>
    tokenSnaps[i].docs.map((d) => ({
      ref: d.ref,
      message: {
        token: d.id,
        notification: { title: 'Sabeel Kanban', body: text },
        // `type` is what lets a tapped notification open the right screen. It is
        // the only routing signal a `newUserPending` carries — that event has no
        // board and no card, so without it the tap has nowhere to go and the app
        // just opens where it was. Must stay in step with the inbox document
        // written above; the client maps both through one `routeForNotification`.
        data: {
          type: params.event,
          boardId: params.boardId,
          ...(params.cardId ? { cardId: params.cardId } : {}),
          notifId: notifIdByUid.get(r.uid) ?? '',
        },
        // Without this every push lands in expo-notifications' fallback channel,
        // which Android shows as "Miscellaneous" — see PUSH_CHANNEL_ID.
        android: { notification: { channelId: PUSH_CHANNEL_ID } },
      },
    })),
  );
  if (sends.length === 0) return;

  try {
    const res = await getMessaging().sendEach(sends.map((s) => s.message));

    // Prune tokens FCM has rejected as dead. Nothing else ever would: a token is
    // removed on sign-out, but an uninstall, a data clear, or a factory reset
    // leaves it behind forever. Left alone, every send to that person carries a
    // growing tail of tokens that can only fail.
    //
    // Only these two codes mean "this token is gone". Everything else —
    // quota, an unavailable backend, an internal error — is transient, and
    // deleting on those would unregister working devices.
    const dead = res.responses.flatMap((r, i) => {
      const code = r.error?.code;
      return code === 'messaging/registration-token-not-registered' ||
        code === 'messaging/invalid-registration-token'
        ? [sends[i].ref]
        : [];
    });
    if (dead.length > 0) {
      await Promise.all(dead.map((ref) => ref.delete()));
      logger.info('pruned dead push tokens', { count: dead.length });
    }
  } catch (e) {
    logger.warn('push send failed (inbox entry was still written)', {
      error: String(e),
    });
  }
}

/**
 * A comment: notifies mentioned people, and the card's assignees.
 *
 * Written, not created. An @mention typed while EDITING a comment is a real
 * mention — the app re-derives `mentionUids` on every edit — and a create-only
 * trigger told that person nothing at all, which made mentioning someone in an
 * edit silently useless.
 *
 * The two events are not symmetric, deliberately:
 *
 *  - Mentions notify whoever is NEWLY named. Diffing against the previous
 *    mention list is what stops an edit from re-paging everyone already in the
 *    comment, so fixing a typo does not buzz the whole thread again.
 *  - `commentOnMyCard` fires on CREATE only. Editing a comment is not a new
 *    comment, and telling assignees "Sara commented" because Sara corrected a
 *    word would be noise of exactly the kind this app avoids.
 */
export const onCommentNotify = onDocumentWritten(
  {
    document: 'cards/{cardId}/comments/{commentId}',
    secrets: [sentryDsn],
  },
  guardedEvent(async (event) => {
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    // Deleted: nothing to announce.
    if (!after) return;
    const created = !before;

    const { cardId } = event.params;
    const authorUid = after.authorUid as string;
    const mentionUids = (after.mentionUids as string[]) ?? [];
    const alreadyMentioned = (before?.mentionUids as string[]) ?? [];
    const newlyMentioned = mentionUids.filter((u) => !alreadyMentioned.includes(u));

    // Nothing new to say: an edit that changed only the wording.
    if (!created && newlyMentioned.length === 0) return;

    // boardId is now a field on the card, not the path — read it from the card
    // (which we fetch anyway for title/assignees). It gates the board-mute check.
    const card = await db().doc(`cards/${cardId}`).get();
    const boardId = (card.data()?.boardId as string) ?? '';
    const cardTitle = card.data()?.title as string | undefined;
    const assignees = (card.data()?.assigneeUids as string[]) ?? [];

    const actorName = await nameOf(authorUid);

    // A mention wins over the generic comment notification, so being both
    // mentioned and an assignee does not produce two pushes for one comment.
    await notify({
      event: 'mention',
      recipients: await loadRecipients(newlyMentioned),
      actorUid: authorUid,
      actorName,
      boardId,
      cardId,
      cardTitle,
    });

    if (!created) return;

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
  }),
);

/** Assignment and moves on a card someone owns. */
export const onCardNotify = onDocumentWritten(
  { document: 'cards/{cardId}', secrets: [sentryDsn] },
  guardedEvent(async (event) => {
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    if (!after) return;

    const { cardId } = event.params;
    // boardId is a field now. Note: a cross-board move changes it AND columnId,
    // so remaining assignees (members of both boards) get the 'myCardMoved'
    // notification below; assignees dropped by the move are simply removed from
    // `after.assigneeUids` and get nothing (the intended "drop silently" behaviour).
    const boardId = (after.boardId as string) ?? '';
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
  }),
);

/** Admins hear about people waiting for approval. */
export const onUserPending = onDocumentCreated(
  { document: 'users/{uid}', secrets: [sentryDsn] },
  guardedEvent(async (event) => {
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
  }),
);

/**
 * Due-soon reminders, once a day.
 *
 * 08:00 in the org timezone: early enough to act on, late enough not to be a
 * 3am buzz. Runs a collection-group query for cards due today or tomorrow and
 * notifies their assignees.
 */
export const dueSoonReminders = onSchedule(
  { schedule: '0 8 * * *', timeZone: ORG_TIMEZONE, secrets: [sentryDsn] },
  guardedEvent(async () => {
    const today = todayInOrgTz();
    const horizon = addDays(today, 1);

    const due = await db()
      .collection('cards')
      .where('archived', '==', false)
      .where('dueDate', '>=', today)
      .where('dueDate', '<=', horizon)
      .get();

    logger.info('due-soon sweep', { today, horizon, cards: due.size });

    for (const card of due.docs) {
      const assignees = (card.data().assigneeUids as string[]) ?? [];
      if (assignees.length === 0) continue;

      // boardId is a field now (cards are top-level, so there is no parent board
      // to read it from).
      const boardId = (card.data().boardId as string) ?? '';
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
  }),
);
