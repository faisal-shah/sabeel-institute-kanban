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
} from '@sabeel/shared';
import { db, functions } from './firebase';
import { useLiveDoc, useLiveQuery } from './liveQuery';
import type { SessionUser } from './session';

export interface BoardMemberProfile {
  uid: string;
  displayName: string;
  email: string;
}

export interface BoardListItem {
  id: string;
  name: string;
  description: string;
  archived: boolean;
  memberUids: string[];
  /**
   * Who is on this board, with names. Read from the board doc rather than
   * `users/*` because only admins may list the directory — every member needs
   * this to assign a card or @mention someone.
   */
  members: BoardMemberProfile[];
  columns: BoardColumn[];
  /** Non-archived cards on the board (server-maintained; shown in the Boards list). */
  activeCardCount: number;
}

function toBoard(id: string, data: Record<string, unknown>): BoardListItem {
  const uids = (data.memberUids as string[]) ?? [];
  const profiles =
    (data.memberProfiles as Record<string, { displayName: string; email: string }>) ?? {};

  return {
    id,
    name: (data.name as string) ?? '(untitled)',
    description: (data.description as string) ?? '',
    archived: Boolean(data.archived),
    memberUids: uids,
    // Derived from memberUids so a missing profile never hides a member — it
    // just shows a placeholder name until the next membership write fills it in.
    members: uids
      .map((uid) => ({
        uid,
        displayName: profiles[uid]?.displayName ?? 'Someone',
        email: profiles[uid]?.email ?? '',
      }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName)),
    columns: (data.columns as BoardColumn[]) ?? [],
    activeCardCount: (data.activeCardCount as number) ?? 0,
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
    createdByProfile: { displayName: user.displayName, email: user.email },
    now: Date.now(),
  });
  const ref = await addDoc(collection(db, 'boards'), board);
  return ref.id;
}

/**
 * A board patch. `columns` may ONLY be written together with `columnIds` — the
 * type enforces what a comment cannot: rules validate card writes against the
 * flat mirror, so a desynced pair makes cards uncreatable in the new column with
 * a bare PERMISSION_DENIED as the only clue. Build it with `columnsPatch()`.
 */
export type BoardPatch = Partial<
  Pick<BoardListItem, 'name' | 'description' | 'archived'>
> &
  ({ columns: BoardColumn[]; columnIds: string[] } | { columns?: never; columnIds?: never });

export async function updateBoard(
  boardId: string,
  patch: BoardPatch,
): Promise<void> {
  // `createdBy` must be echoed back: the update rule pins it to its existing
  // value so authorship cannot be rewritten, and Firestore rules compare against
  // the full incoming document.
  const snap = await getDoc(doc(db, 'boards', boardId));
  const createdBy = snap.data()?.createdBy;
  await updateDoc(doc(db, 'boards', boardId), { ...patch, createdBy });
}

export async function addBoardMember(
  boardId: string,
  person: { uid: string; displayName: string; email: string },
): Promise<void> {
  const snap = await getDoc(doc(db, 'boards', boardId));
  await updateDoc(doc(db, 'boards', boardId), {
    memberUids: arrayUnion(person.uid),
    // The profile travels with the membership, so board members can see who is
    // on the board without permission to list the user directory.
    [`memberProfiles.${person.uid}`]: {
      displayName: person.displayName,
      email: person.email,
    },
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
