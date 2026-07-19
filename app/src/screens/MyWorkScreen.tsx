import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { describeDue, groupByDue, todayInOrgTz } from '@sabeel/shared';
import { useMyWork, type MyWorkCard } from '../myWork';
import { useMyBoards } from '../boards';
import type { SessionUser } from '../session';
import { useNav } from '../nav';
import {
  Body,
  Button,
  Caption,
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
    <Screen>
      <Row style={styles.between}>
        <Title>My work</Title>
        <Button
          label="Boards"
          variant="secondary"
          onPress={() => nav.reset({ name: 'boards' })}
        />
      </Row>
      <Caption>
        {total === 0
          ? 'Nothing is assigned to you right now.'
          : `${total} card${total === 1 ? '' : 's'} assigned to you across all your boards.`}
      </Caption>

      {groups.map((g) => (
        <View key={g.bucket}>
          <Heading>
            {g.label} ({g.cards.length})
          </Heading>
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
        </View>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  between: { justifyContent: 'space-between' },
  dot: { width: 10, height: 10, borderRadius: radius.pill },
});
