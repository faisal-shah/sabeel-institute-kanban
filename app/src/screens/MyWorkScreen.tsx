import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { describeDue, groupByDue, todayInOrgTz } from '@sabeel/shared';
import { useMyWork, type MyWorkCard } from '../myWork';
import { useMyBoards } from '../boards';
import type { SessionUser } from '../session';
import { useNav } from '../nav';
import {
  Body,
  Caption,
  CardGrid,
  Hint,
  Card as Panel,
  Heading,
  Row,
  Screen,
  Spinner,
  Title,
} from '../components/ui';
import { radius, useTheme } from '../theme';

/**
 * Everything assigned to me, everywhere — the reason this app beats opening five
 * boards in turn, and the phone's most useful screen.
 */
export function MyWorkScreen({ user }: { user: SessionUser }) {
  const nav = useNav();
  const work = useMyWork(user);
  const boards = useMyBoards(user);
  const t = useTheme();
  const today = todayInOrgTz();

  // Board names come from the caller's OWN board list — no denormalised name on
  // each card, and nothing to fan out when a board is renamed. Sound because
  // assignment implies membership.
  const boardNames = useMemo(() => {
    const m = new Map<string, string>();
    for (const b of boards.data ?? []) m.set(b.id, b.name);
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
            {g.cards.map((c: MyWorkCard) => (
              <Pressable
                key={`${c.boardId}/${c.id}`}
                accessibilityRole="button"
                accessibilityLabel={c.title}
                onPress={() =>
                  nav.push({ name: 'card', boardId: c.boardId, cardId: c.id })
                }
              >
                <Panel>
                  <Body>{c.title}</Body>
                  <Row>
                    <View
                      style={[styles.dot, { backgroundColor: t.priority[c.priority] }]}
                    />
                    <Caption>{boardNames.get(c.boardId) ?? 'a board'}</Caption>
                    {c.dueDate ? (
                      <Caption>· {describeDue(c.dueDate, today)}</Caption>
                    ) : null}
                  </Row>
                </Panel>
              </Pressable>
            ))}
          </CardGrid>
        </View>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  dot: { width: 10, height: 10, borderRadius: radius.pill },
});
