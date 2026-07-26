import { useMemo } from 'react';
import { Pressable, View } from 'react-native';
import { groupByDue, todayInOrgTz, type BoardLabel } from '@sabeel/shared';
import { useMyWork, type MyWorkCard } from '../myWork';
import { useMyBoards, type BoardListItem, type BoardMemberProfile } from '../boards';
import type { SessionUser } from '../session';
import { useNav } from '../nav';
import {
  Caption,
  Card as Panel,
  CardGrid,
  Heading,
  Hint,
  LoadError,
  Screen,
  Spinner,
  Title,
} from '../components/ui';
import { CardFace } from '../components/CardFace';

const NO_LABELS: BoardLabel[] = [];
const NO_MEMBERS: BoardMemberProfile[] = [];

/**
 * Everything assigned to me, everywhere — the reason this app beats opening five
 * boards in turn, and the phone's most useful screen.
 */
export function MyWorkScreen({ user }: { user: SessionUser }) {
  const nav = useNav();
  const work = useMyWork(user);
  const boards = useMyBoards(user);
  const today = todayInOrgTz();

  // The card face resolves labels/assignees against each card's OWN board, taken
  // from the caller's board list — no denormalised copies on the card, nothing to
  // fan out on a rename. Sound because assignment implies membership.
  const boardById = useMemo(() => {
    const m = new Map<string, BoardListItem>();
    for (const b of boards.data ?? []) m.set(b.id, b);
    return m;
  }, [boards.data]);

  /**
   * Only work on a board you can actually see.
   *
   * `useMyWork` is a flat card query — `assigneeUids array-contains me` — so it
   * knows nothing about boards, and an ARCHIVED board's cards kept turning up
   * here forever: rendered as "in a board", with no name, no labels and no
   * assignee chips, because the board is not in `boardById`. Archiving a board
   * is meant to put it away; leaving its work in everyone's list is the opposite.
   *
   * Scoping to the board list is the same thing Search already does, and it
   * needs no denormalised `boardArchived` on every card. Sound for both roles:
   * `useMyBoards` drops archived boards, gives a member the boards they belong
   * to (and assignment implies membership), and a manager every live board.
   */
  const visible = useMemo(
    () => (work.data ?? []).filter((c) => boardById.has(c.boardId)),
    [work.data, boardById],
  );

  const groups = useMemo(() => groupByDue(visible, today), [visible, today]);

  // Wait for BOTH: filtering against a board list that has not arrived yet would
  // briefly show "nothing assigned to you" to someone who has plenty.
  if (work.status === 'loading' || boards.status === 'loading') {
    return <Spinner label="Loading your work…" />;
  }
  if (work.status === 'error' || boards.status === 'error') {
    return (
      <Screen width="list">
        <Title>My work</Title>
        <LoadError what="your work" />
      </Screen>
    );
  }

  const total = visible.length;

  return (
    <Screen width="list">
      {/* No Back button: My work is a tab root reached from the nav bar, never
          pushed, so there is nothing to go back to. */}
      <Title>My work</Title>
      <Hint>
        {total === 0
          ? 'Nothing is assigned to you right now.'
          : `${total} card${total === 1 ? '' : 's'} assigned to you across all your boards.`}
      </Hint>

      {groups.map((g) => (
        <View key={g.bucket}>
          <Heading>
            {g.label} ({g.cards.length})
          </Heading>
          <CardGrid>
            {g.cards.map((c: MyWorkCard) => {
              const board = boardById.get(c.boardId);
              return (
                <Pressable
                  key={`${c.boardId}/${c.id}`}
                  accessibilityRole="button"
                  accessibilityLabel={c.title}
                  onPress={() =>
                    nav.push({ name: 'card', boardId: c.boardId, cardId: c.id })
                  }
                >
                  <Panel>
                    <CardFace
                      card={c}
                      boardLabels={board?.labels ?? NO_LABELS}
                      boardMembers={board?.members ?? NO_MEMBERS}
                    />
                    <Caption>in {board?.name ?? 'a board'}</Caption>
                  </Panel>
                </Pressable>
              );
            })}
          </CardGrid>
        </View>
      ))}
    </Screen>
  );
}
