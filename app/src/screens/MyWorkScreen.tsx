import { useMemo } from 'react';
import { Pressable, View } from 'react-native';
import { groupByDue, todayInOrgTz, type BoardLabel } from '@sabeel/shared';
import { useMyWork, type MyWorkCard } from '../myWork';
import { useMyBoards, type BoardListItem, type BoardMemberProfile } from '../boards';
import type { SessionUser } from '../session';
import { useNav } from '../nav';
import {
  Caption,
  CardGrid,
  Hint,
  Card as Panel,
  Heading,
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

  const groups = useMemo(
    () => groupByDue(work.data ?? [], today),
    [work.data, today],
  );

  if (work.status === 'loading') return <Spinner label="Loading your work…" />;

  const total = work.data?.length ?? 0;

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
