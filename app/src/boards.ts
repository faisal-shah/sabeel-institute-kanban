import {
  addDoc,
  arrayUnion,
  collection,
  doc,
  getDoc,
  query,
  updateDoc,
  where,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import {
  MAX_RECENT_BOARDS,
  newBoard,
  pushRecent,
  type BoardColumn,
  type BoardDoc,
  type BoardLabel,
} from '@sabeel/shared';
import { db, functions } from './firebase';
import { useLiveDoc, useLiveQuery } from './liveQuery';
import type { SessionUser } from './session';

export interface BoardListItem {
  id: string;
  name: string;
  description: string;
  archived: boolean;
  memberUids: string[];
  columns: BoardColumn[];
  labels: BoardLabel[];
}

function toBoard(id: string, data: Record<string, unknown>): BoardListItem {
  return {
    id,
    name: (data.name as string) ?? '(untitled)',
    description: (data.description as string) ?? '',
    archived: Boolean(data.archived),
    memberUids: (data.memberUids as string[]) ?? [],
    columns: (data.columns as BoardColumn[]) ?? [],
    labels: (data.labels as BoardLabel[]) ?? [],
  };
}

/**
 * The boards you can see.
 *
 * Managers and admins query unconstrained (rules allow it because `isManager()`
 * does not depend on document data). Members MUST carry the array-contains
 * constraint — without it Firestore rejects the whole query rather than
 * filtering, since it cannot prove the result set is readable.
 */
export function useMyBoards(user: SessionUser) {
  const isManager = user.role === 'manager' || user.role === 'admin';
  return useLiveQuery<BoardListItem[]>(
    'boards',
    () =>
      isManager
        ? collection(db, 'boards')
        : query(collection(db, 'boards'), where('memberUids', 'array-contains', user.uid)),
    (docs) => docs.map((d) => toBoard(d.id, d.data)).filter((b) => !b.archived),
    [user.uid, isManager],
  );
}

/** Archived boards, for the manager-facing archive view. */
export function useArchivedBoards(user: SessionUser) {
  const isManager = user.role === 'manager' || user.role === 'admin';
  return useLiveQuery<BoardListItem[]>(
    'archived-boards',
    () =>
      isManager
        ? collection(db, 'boards')
        : query(collection(db, 'boards'), where('memberUids', 'array-contains', user.uid)),
    (docs) => docs.map((d) => toBoard(d.id, d.data)).filter((b) => b.archived),
    [user.uid, isManager],
  );
}

export function useBoard(boardId: string) {
  return useLiveDoc<BoardListItem | null>(
    'board',
    () => doc(db, 'boards', boardId),
    (d) => (d ? toBoard(d.id, d.data) : null),
    [boardId],
  );
}

export async function createBoard(name: string, user: SessionUser): Promise<string> {
  const board: BoardDoc = newBoard({
    name,
    createdBy: user.uid,
    now: Date.now(),
  });
  const ref = await addDoc(collection(db, 'boards'), board);
  return ref.id;
}

export async function updateBoard(
  boardId: string,
  patch: Partial<Pick<BoardListItem, 'name' | 'description' | 'columns' | 'labels' | 'archived'>>,
): Promise<void> {
  // `createdBy` must be echoed back: the update rule pins it to its existing
  // value so authorship cannot be rewritten, and Firestore rules compare against
  // the full incoming document.
  const snap = await getDoc(doc(db, 'boards', boardId));
  const createdBy = snap.data()?.createdBy;
  await updateDoc(doc(db, 'boards', boardId), { ...patch, createdBy });
}

export async function addBoardMember(boardId: string, uid: string): Promise<void> {
  const snap = await getDoc(doc(db, 'boards', boardId));
  await updateDoc(doc(db, 'boards', boardId), {
    memberUids: arrayUnion(uid),
    createdBy: snap.data()?.createdBy,
  });
}

/**
 * Removal goes through a callable, because membership and card assignment must
 * move together — see functions/src/boards.ts for why.
 */
const removeMemberFn = httpsCallable<
  { boardId: string; uid: string },
  { ok: boolean; unassignedCards: number }
>(functions, 'removeBoardMember');

export async function removeBoardMember(
  boardId: string,
  uid: string,
): Promise<number> {
  const res = await removeMemberFn({ boardId, uid });
  return res.data.unassignedCards;
}

const countAssignmentsFn = httpsCallable<
  { boardId: string; uid: string },
  { count: number }
>(functions, 'countMemberAssignments');

/** "Remove Sara?" and "Remove Sara, unassigning 12 cards?" are different questions. */
export async function countMemberAssignments(
  boardId: string,
  uid: string,
): Promise<number> {
  const res = await countAssignmentsFn({ boardId, uid });
  return res.data.count;
}

// ---- Per-user board list state (favourites and recents) --------------------

export async function toggleFavourite(
  user: SessionUser,
  boardId: string,
  favourites: readonly string[],
): Promise<void> {
  const next = favourites.includes(boardId)
    ? favourites.filter((id) => id !== boardId)
    : [...favourites, boardId];
  await updateDoc(doc(db, 'users', user.uid), { favoriteBoardIds: next });
}

export async function noteBoardOpened(
  user: SessionUser,
  boardId: string,
  recents: readonly string[],
): Promise<void> {
  const next = pushRecent(recents, boardId, MAX_RECENT_BOARDS);
  if (next[0] === recents[0] && next.length === recents.length) return;
  await updateDoc(doc(db, 'users', user.uid), { recentBoardIds: next });
}

/** The signed-in user's own list preferences, live. */
export function useMyBoardPrefs(user: SessionUser) {
  return useLiveDoc<{ favourites: string[]; recents: string[] }>(
    'board-prefs',
    () => doc(db, 'users', user.uid),
    (d) => ({
      favourites: (d?.data.favoriteBoardIds as string[]) ?? [],
      recents: (d?.data.recentBoardIds as string[]) ?? [],
    }),
    [user.uid],
  );
}
