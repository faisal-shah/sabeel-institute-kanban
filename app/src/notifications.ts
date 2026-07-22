import {
  collection,
  deleteDoc,
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

/** Mark everything read in one batch, and zero the badge. */
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

export async function dismiss(user: SessionUser, item: InboxItem): Promise<void> {
  await deleteDoc(doc(db, 'users', user.uid, 'notifications', item.id));
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
