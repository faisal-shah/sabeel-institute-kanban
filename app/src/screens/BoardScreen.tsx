import type { SessionUser } from '../session';
import { useLayout } from '../theme/layout';
import { NarrowBoard } from '../components/board/NarrowBoard';
import { WideBoard } from '../components/board/WideBoard';

/**
 * Picks a board layout by AVAILABLE WIDTH.
 *
 * This is the whole point of the split, and it was originally got wrong: the
 * board was chosen by platform, so a tablet running the Android app got the
 * phone's one-column swipe layout on a 10-inch screen, and a phone browser got
 * the desktop drag board on 380px. Neither is about the platform — both are
 * about how much room there is.
 *
 *   wide   (>= 900px)  → columns side by side
 *   narrow (<  900px)  → one column at a time, swipe between them
 *
 * Platform still decides ONE thing, inside WideBoard: whether HTML5
 * drag-and-drop exists. `WideBoard.web.tsx` drags; `WideBoard.tsx` (native,
 * i.e. tablets) offers an explicit "Move to…" instead. Metro resolves the right
 * one, so this file never has to know.
 *
 * Resizing a browser window switches layouts live, because `useLayout` is driven
 * by useWindowDimensions.
 */
export function BoardScreen({ boardId, user }: { boardId: string; user: SessionUser }) {
  const { isWide } = useLayout();

  return isWide ? (
    <WideBoard boardId={boardId} user={user} />
  ) : (
    <NarrowBoard boardId={boardId} user={user} />
  );
}
