import { collection, query, where } from 'firebase/firestore';
import type { Priority } from '@sabeel/shared';
import { db } from './firebase';
import { useLiveQuery } from './liveQuery';
import type { SessionUser } from './session';

export interface MyWorkCard {
  id: string;
  boardId: string;
  title: string;
  columnId: string;
  dueDate?: string;
  priority: Priority;
  archived: boolean;
}

/**
 * Every card assigned to me, across every board — the cross-board "My Work"
 * view, and the phone's most useful screen.
 *
 * Cards are a top-level collection, so this is a plain COLLECTION query. Two
 * things make it work:
 *
 *  1. The `array-contains` constraint on my own uid is mandatory. Rules only
 *     permit a list they can prove is restricted to the caller (the read rule's
 *     assignee arm); an unconstrained `collection('cards')` would be every card
 *     in the organisation and is rejected outright.
 *
 *  2. The board id is now a FIELD on the card; the board NAME is resolved from
 *     the caller's own board list. That works because assignment implies board
 *     membership, so every board appearing here is already one the user can see
 *     — which is why no board name is denormalised onto cards and no fan-out is
 *     needed when a board is renamed.
 *
 * The `archived` filter is applied client-side rather than in the query so the
 * whole thing needs only the automatic single-field array index.
 */
export function useMyWork(user: SessionUser) {
  return useLiveQuery<MyWorkCard[]>(
    'my-work',
    () =>
      query(collection(db, 'cards'), where('assigneeUids', 'array-contains', user.uid)),
    (docs) =>
      docs
        .map((d) => ({
          id: d.id,
          boardId: (d.data.boardId as string) ?? '',
          title: (d.data.title as string) ?? '',
          columnId: (d.data.columnId as string) ?? '',
          dueDate: d.data.dueDate as string | undefined,
          priority: (d.data.priority as Priority) ?? 'none',
          archived: Boolean(d.data.archived),
        }))
        .filter((c) => !c.archived),
    [user.uid],
  );
}
