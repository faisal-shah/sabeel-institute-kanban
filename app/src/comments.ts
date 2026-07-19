import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  orderBy,
  query,
  updateDoc,
} from 'firebase/firestore';
import { extractMentions, type MentionCandidate } from '@sabeel/shared';
import { db } from './firebase';
import { useLiveQuery } from './liveQuery';
import type { SessionUser } from './session';

export interface Comment {
  id: string;
  authorUid: string;
  body: string;
  mentionUids: string[];
  createdAt: number;
  editedAt?: number;
}

const commentsRef = (boardId: string, cardId: string) =>
  collection(db, 'boards', boardId, 'cards', cardId, 'comments');

export function useComments(boardId: string, cardId: string) {
  return useLiveQuery<Comment[]>(
    'comments',
    () => query(commentsRef(boardId, cardId), orderBy('createdAt')),
    (docs) =>
      docs.map((d) => ({
        id: d.id,
        authorUid: (d.data.authorUid as string) ?? '',
        body: (d.data.body as string) ?? '',
        mentionUids: (d.data.mentionUids as string[]) ?? [],
        createdAt: (d.data.createdAt as number) ?? 0,
        editedAt: d.data.editedAt as number | undefined,
      })),
    [boardId, cardId],
  );
}

/**
 * Mentions are resolved on the CLIENT and stored alongside the text.
 *
 * Rules then check that every mentioned uid is a board member, so a mention can
 * never notify someone who cannot open the card it points at. Re-parsing the
 * body server-side would have to agree exactly with this parser to be useful,
 * which is a duplication waiting to drift.
 */
export async function addComment(params: {
  boardId: string;
  cardId: string;
  body: string;
  candidates: readonly MentionCandidate[];
  user: SessionUser;
}): Promise<void> {
  const body = params.body.trim();
  if (!body) return;

  await addDoc(commentsRef(params.boardId, params.cardId), {
    authorUid: params.user.uid,
    body,
    mentionUids: extractMentions(body, params.candidates),
    createdAt: Date.now(),
  });
}

export async function editComment(params: {
  boardId: string;
  cardId: string;
  commentId: string;
  body: string;
}): Promise<void> {
  await updateDoc(
    doc(db, 'boards', params.boardId, 'cards', params.cardId, 'comments', params.commentId),
    { body: params.body.trim(), editedAt: Date.now() },
  );
}

export async function deleteComment(
  boardId: string,
  cardId: string,
  commentId: string,
): Promise<void> {
  await deleteDoc(doc(db, 'boards', boardId, 'cards', cardId, 'comments', commentId));
}
