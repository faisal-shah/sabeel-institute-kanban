import {
  collection,
  doc,
  increment,
  limit,
  orderBy,
  query,
  runTransaction,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import type { NotifyEvent } from '@sabeel/shared';
import { db } from './firebase';
import { useLiveDoc, useLiveQuery } from './liveQuery';
import type { Route } from './nav';
import type { SessionUser } from './session';

export interface InboxItem {
  id: string;
  type: NotifyEvent;
  boardId: string;
  cardId?: string;
  actorUid: string;
  text: string;
  read: boolean;
  at: number;
}

const inboxRef = (uid: string) => collection(db, 'users', uid, 'notifications');

/**
 * Where a notification takes you when you tap it.
 *
 * ONE mapping, deliberately, because there are two places to tap the same
 * notification: the Alerts list in the app, and the banner in the phone's
 * notification tray. Those arrive by completely different routes — a Firestore
 * document versus an FCM data payload — but they must land on the same screen,
 * so they share this function rather than each deciding for themselves.
 *
 * Takes the loose shape both sources can supply, not `InboxItem`: the push
 * payload is `Record<string, string>` off the wire and has no `id`, `read` or
 * `at`. Returns null when there is nowhere sensible to go, so a caller can leave
 * the user where they are instead of navigating somewhere arbitrary.
 */
export function routeForNotification(n: {
  type?: string;
  boardId?: string;
  cardId?: string;
}): Route | null {
  // Admins only, and it carries no board — the whole point is the person
  // waiting, who lives on the People screen.
  if (n.type === 'newUserPending') return { name: 'users' };
  if (n.cardId && n.boardId) {
    return { name: 'card', boardId: n.boardId, cardId: n.cardId };
  }
  if (n.boardId) return { name: 'board', boardId: n.boardId };
  return null;
}

/** The in-app inbox, newest first. Capped — nobody scrolls past 50. */
export function useInbox(user: SessionUser) {
  return useLiveQuery<InboxItem[]>(
    'inbox',
    () => query(inboxRef(user.uid), orderBy('at', 'desc'), limit(50)),
    (docs) =>
      docs.map((d) => ({
        id: d.id,
        type: (d.data.type as NotifyEvent) ?? 'mention',
        boardId: (d.data.boardId as string) ?? '',
        cardId: d.data.cardId as string | undefined,
        actorUid: (d.data.actorUid as string) ?? '',
        text: (d.data.text as string) ?? '',
        read: Boolean(d.data.read),
        at: (d.data.at as number) ?? 0,
      })),
    [user.uid],
  );
}

/** The unread badge. Maintained by the trigger; read straight off the user doc. */
export function useUnreadCount(user: SessionUser) {
  return useLiveDoc<number>(
    'unread-count',
    () => doc(db, 'users', user.uid),
    (d) => (d?.data.unreadNotifCount as number) ?? 0,
    [user.uid],
  );
}

export async function markRead(user: SessionUser, item: InboxItem): Promise<void> {
  if (item.read) return;
  const notifRef = doc(db, 'users', user.uid, 'notifications', item.id);
  const userRef = doc(db, 'users', user.uid);
  // A transaction, not a batch: it RE-READS `read` inside the transaction and
  // only decrements if the entry was genuinely still unread. Two rapid taps (or
  // two tabs) on the same item both see the stale `read: false` on the passed-in
  // snapshot; without the re-read each would `increment(-1)` and drift the badge
  // negative. The decrement stays on the client — rules let it flip `read` and
  // adjust its own `unreadNotifCount`, and a trigger racing that would double-count.
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(notifRef);
    if (!snap.exists() || snap.data().read === true) return;
    tx.update(notifRef, { read: true });
    tx.update(userRef, { unreadNotifCount: increment(-1) });
  });
}

/**
 * Mark everything read in one batch, and zero the badge.
 *
 * The badge goes to 0 rather than down by `unread.length`: the inbox is capped
 * at 50, so if more than that were ever unread the extras are not in `items` and
 * a relative decrement would leave a badge pointing at entries nobody can reach.
 * "Read everything" means the badge is empty.
 */
export async function markAllRead(
  user: SessionUser,
  items: readonly InboxItem[],
): Promise<void> {
  const unread = items.filter((i) => !i.read);
  const batch = writeBatch(db);
  for (const i of unread) {
    batch.update(doc(db, 'users', user.uid, 'notifications', i.id), { read: true });
  }
  batch.update(doc(db, 'users', user.uid), { unreadNotifCount: 0 });
  await batch.commit();
}

/**
 * Delete one entry, decrementing the badge if it was still unread.
 *
 * The decrement is NOT optional: nothing on the server watches for a deleted
 * notification (there is no delete trigger — see functions/src/notifications.ts,
 * which only ever increments on create), so dismissing an unread entry without
 * this leaves the badge counting a document that no longer exists. The user then
 * sees "3" forever with an inbox that has nothing unread in it.
 *
 * Same transaction shape as markRead, and for the same reason: `item.read` comes
 * from a snapshot that may be stale, so the truth is re-read inside the
 * transaction before the badge is touched.
 */
export async function dismiss(user: SessionUser, item: InboxItem): Promise<void> {
  const notifRef = doc(db, 'users', user.uid, 'notifications', item.id);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(notifRef);
    if (!snap.exists()) return;
    if (snap.data().read !== true) {
      tx.update(doc(db, 'users', user.uid), { unreadNotifCount: increment(-1) });
    }
    tx.delete(notifRef);
  });
}

/**
 * Empty the inbox in one batch, and zero the badge.
 *
 * Deletes what is loaded — the same capped 50 `markAllRead` covers — and zeroes
 * the badge for the reason given there. No undo, which is why the caller
 * confirms first.
 */
export async function dismissAll(
  user: SessionUser,
  items: readonly InboxItem[],
): Promise<void> {
  if (items.length === 0) return;
  const batch = writeBatch(db);
  for (const i of items) {
    batch.delete(doc(db, 'users', user.uid, 'notifications', i.id));
  }
  batch.update(doc(db, 'users', user.uid), { unreadNotifCount: 0 });
  await batch.commit();
}

// ---- Preferences ----------------------------------------------------------

export function useNotifyPrefs(user: SessionUser) {
  return useLiveDoc<{
    prefs: Partial<Record<NotifyEvent, boolean>>;
    mutedBoardIds: string[];
  }>(
    'notify-prefs',
    () => doc(db, 'users', user.uid),
    (d) => ({
      prefs: (d?.data.notifyPrefs as Partial<Record<NotifyEvent, boolean>>) ?? {},
      mutedBoardIds: (d?.data.mutedBoardIds as string[]) ?? [],
    }),
    [user.uid],
  );
}

export async function setNotifyPref(
  user: SessionUser,
  event: NotifyEvent,
  on: boolean,
  current: Partial<Record<NotifyEvent, boolean>>,
): Promise<void> {
  await updateDoc(doc(db, 'users', user.uid), {
    notifyPrefs: { ...current, [event]: on },
  });
}

export async function setBoardMuted(
  user: SessionUser,
  boardId: string,
  muted: boolean,
  current: readonly string[],
): Promise<void> {
  const next = muted
    ? Array.from(new Set([...current, boardId]))
    : current.filter((id) => id !== boardId);
  await updateDoc(doc(db, 'users', user.uid), { mutedBoardIds: next });
}
