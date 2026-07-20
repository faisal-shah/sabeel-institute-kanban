import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  orderBy,
  query,
  deleteField,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  compareRank,
  needsRerank,
  rankBetween,
  rerank,
  type CardDoc,
  type Priority,
} from '@sabeel/shared';
import { db } from './firebase';
import { useLiveDoc, useLiveQuery } from './liveQuery';
import type { SessionUser } from './session';

export interface Card {
  id: string;
  title: string;
  description: string;
  columnId: string;
  rank: string;
  assigneeUids: string[];
  dueDate?: string;
  priority: Priority;
  labelIds: string[];
  archived: boolean;
  commentCount: number;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
}

function toCard(id: string, d: Record<string, unknown>): Card {
  return {
    id,
    title: (d.title as string) ?? '',
    description: (d.description as string) ?? '',
    columnId: (d.columnId as string) ?? '',
    rank: (d.rank as string) ?? '',
    assigneeUids: (d.assigneeUids as string[]) ?? [],
    dueDate: d.dueDate as string | undefined,
    priority: (d.priority as Priority) ?? 'none',
    labelIds: (d.labelIds as string[]) ?? [],
    archived: Boolean(d.archived),
    commentCount: (d.commentCount as number) ?? 0,
    createdBy: (d.createdBy as string) ?? '',
    createdAt: (d.createdAt as number) ?? 0,
    updatedAt: (d.updatedAt as number) ?? 0,
  };
}

const cardsRef = (boardId: string) => collection(db, 'boards', boardId, 'cards');

/** Live cards for a board, already in rank order. */
export function useBoardCards(boardId: string) {
  return useLiveQuery<Card[]>(
    'cards',
    () => query(cardsRef(boardId), where('archived', '==', false), orderBy('rank')),
    (docs) => docs.map((d) => toCard(d.id, d.data)).sort(compareRank),
    [boardId],
  );
}

export function useArchivedCards(boardId: string) {
  return useLiveQuery<Card[]>(
    'archived-cards',
    () => query(cardsRef(boardId), where('archived', '==', true)),
    (docs) => docs.map((d) => toCard(d.id, d.data)),
    [boardId],
  );
}

export function useCard(boardId: string, cardId: string) {
  return useLiveDoc<Card | null>(
    'card',
    () => doc(db, 'boards', boardId, 'cards', cardId),
    (d) => (d ? toCard(d.id, d.data) : null),
    [boardId, cardId],
  );
}

export function cardsInColumn(cards: readonly Card[], columnId: string): Card[] {
  return cards.filter((c) => c.columnId === columnId).sort(compareRank);
}

export async function createCard(params: {
  boardId: string;
  columnId: string;
  title: string;
  user: SessionUser;
  /** Existing cards in the target column, so the new one lands at the bottom. */
  columnCards: readonly Card[];
}): Promise<string> {
  const last = params.columnCards[params.columnCards.length - 1] ?? null;
  const now = Date.now();
  const card: CardDoc = {
    title: params.title.trim(),
    description: '',
    columnId: params.columnId,
    rank: rankBetween(last?.rank ?? null, null),
    assigneeUids: [],
    priority: 'none',
    labelIds: [],
    archived: false,
    commentCount: 0,
    createdAt: now,
    createdBy: params.user.uid,
    updatedAt: now,
    updatedBy: params.user.uid,
  };
  const ref = await addDoc(cardsRef(params.boardId), card);
  return ref.id;
}

export async function updateCard(
  boardId: string,
  cardId: string,
  patch: Partial<Omit<Card, 'id' | 'createdAt' | 'createdBy'>>,
  user: SessionUser,
): Promise<void> {
  // `undefined` means "clear this field", but Firestore REJECTS undefined
  // outright — `updateDoc` throws "Unsupported field value: undefined" rather
  // than removing anything. Clearing a due date failed with exactly that, in the
  // user's face, and left the date on screen. Optional fields have to be mapped
  // to deleteField() explicitly.
  const patched: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    patched[key] = value === undefined ? deleteField() : value;
  }

  await updateDoc(doc(db, 'boards', boardId, 'cards', cardId), {
    ...patched,
    updatedAt: Date.now(),
    updatedBy: user.uid,
  });
}

/**
 * Move a card to a position in a column. ONE document write, which is what makes
 * two people dragging in the same column both succeed — see
 * packages/shared/src/rank.ts.
 *
 * `before`/`after` are the cards that will surround it at the destination.
 */
export async function moveCard(params: {
  boardId: string;
  card: Card;
  toColumnId: string;
  before: Card | null;
  after: Card | null;
  user: SessionUser;
}): Promise<void> {
  const rank = rankBetween(params.before?.rank ?? null, params.after?.rank ?? null);
  await updateCard(
    params.boardId,
    params.card.id,
    { columnId: params.toColumnId, rank },
    params.user,
  );
}

/** Members archive; only managers/admins may destroy. Rules enforce both. */
export async function archiveCard(
  boardId: string,
  cardId: string,
  user: SessionUser,
): Promise<void> {
  await updateCard(boardId, cardId, { archived: true }, user);
}

export async function restoreCard(
  boardId: string,
  cardId: string,
  user: SessionUser,
): Promise<void> {
  await updateCard(boardId, cardId, { archived: false }, user);
}

export async function deleteCard(boardId: string, cardId: string): Promise<void> {
  await deleteDoc(doc(db, 'boards', boardId, 'cards', cardId));
}

// ---- Bulk actions ---------------------------------------------------------
//
// Multi-select exists partly for its own sake and partly because deleting a
// column is blocked while it holds cards: clearing a stale column of forty cards
// must not be forty separate gestures.
//
// Every bulk operation is ONE batch, so a partial application is impossible —
// either the whole selection moves or none of it does.

/** Move many cards into a column at once, preserving their relative order. */
export async function bulkMove(params: {
  boardId: string;
  cards: readonly Card[];
  toColumnId: string;
  /** Cards already in the destination, so the moved block lands after them. */
  destinationCards: readonly Card[];
  user: SessionUser;
}): Promise<void> {
  const moving = [...params.cards].sort(compareRank);
  const staying = params.destinationCards.filter(
    (c) => !moving.some((m) => m.id === c.id),
  );

  const batch = writeBatch(db);
  let prev = staying[staying.length - 1]?.rank ?? null;

  for (const card of moving) {
    // Ranks are assigned in sequence so the selection keeps its order at the
    // destination rather than arriving scrambled.
    const rank = rankBetween(prev, null);
    prev = rank;
    batch.update(doc(db, 'boards', params.boardId, 'cards', card.id), {
      columnId: params.toColumnId,
      rank,
      updatedAt: Date.now(),
      updatedBy: params.user.uid,
    });
  }

  await batch.commit();
}

export async function bulkArchive(
  boardId: string,
  cards: readonly Card[],
  user: SessionUser,
): Promise<void> {
  const batch = writeBatch(db);
  for (const c of cards) {
    batch.update(doc(db, 'boards', boardId, 'cards', c.id), {
      archived: true,
      archivedAt: Date.now(),
      updatedAt: Date.now(),
      updatedBy: user.uid,
    });
  }
  await batch.commit();
}

/** Managers and admins only — rules enforce it on the bulk path too. */
export async function bulkDelete(
  boardId: string,
  cards: readonly Card[],
): Promise<void> {
  const batch = writeBatch(db);
  for (const c of cards) {
    batch.delete(doc(db, 'boards', boardId, 'cards', c.id));
  }
  await batch.commit();
}

/** Add or remove one person across a selection. */
export async function bulkAssign(params: {
  boardId: string;
  cards: readonly Card[];
  uid: string;
  assign: boolean;
  user: SessionUser;
}): Promise<void> {
  const batch = writeBatch(db);
  for (const c of params.cards) {
    const next = params.assign
      ? Array.from(new Set([...c.assigneeUids, params.uid]))
      : c.assigneeUids.filter((u) => u !== params.uid);
    batch.update(doc(db, 'boards', params.boardId, 'cards', c.id), {
      assigneeUids: next,
      updatedAt: Date.now(),
      updatedBy: params.user.uid,
    });
  }
  await batch.commit();
}

/**
 * Quietly rebuild a column's ranks when they have collided or grown long.
 *
 * Rank ties are possible — two clients can compute the same value for the same
 * gap — and are cosmetic rather than corrupting, so this is a background tidy-up
 * that nobody waits for and that is safe to skip on failure.
 */
export async function rerankColumnIfNeeded(
  boardId: string,
  columnCards: readonly Card[],
): Promise<void> {
  if (columnCards.length < 2) return;
  if (!needsRerank(columnCards.map((c) => c.rank))) return;

  const updates = rerank(columnCards);
  if (updates.size === 0) return;

  const batch = writeBatch(db);
  for (const [cardId, rank] of updates) {
    batch.update(doc(db, 'boards', boardId, 'cards', cardId), { rank });
  }
  await batch.commit();
}
