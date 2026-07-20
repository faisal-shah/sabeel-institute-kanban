import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { columnsPatch, compareRank, type BoardColumn } from '@sabeel/shared';
import {
  archiveCard,
  cardsInColumn,
  createCard,
  moveCard,
  useBoardCards,
  type Card,
} from '../../cards';
import { updateBoard, useBoard, type BoardMemberProfile } from '../../boards';
import { useSelection } from '../../useSelection';
import { BulkBar } from '../BulkBar';
import { sessionCan, type SessionUser } from '../../session';
import { useNav } from '../../nav';
import {
  Body,
  Button,
  Caption,
  Card as Panel,
  Row,
  Screen,
  Spinner,
  TextField,
  Title,
} from '../ui';
import { radius, space, useTheme } from '../../theme';
import { useAction } from '../../useAction';

/**
 * The WIDE board, NATIVE build — a tablet, or any large-screen React Native
 * surface.
 *
 * Same column layout as the web build, but WITHOUT drag-and-drop: React Native
 * has no HTML5 drag API, and hand-rolling one with PanResponder across a
 * horizontally scrolling container is exactly the ambiguous-gesture problem the
 * phone layout exists to avoid. So a tablet gets the columns (which is what the
 * extra width is for) plus the same explicit "Move to…" affordance the phone
 * uses — reliable rather than clever.
 *
 * Before this existed, a tablet running the Android app fell through to the
 * phone's swipe layout and showed one column at a time on a 10-inch screen.
 */
const NO_COLUMNS: BoardColumn[] = [];
const EMPTY_CARDS: Card[] = [];
const NO_MEMBERS: BoardMemberProfile[] = [];

export function WideBoard({ boardId, user }: { boardId: string; user: SessionUser }) {
  const nav = useNav();
  const board = useBoard(boardId);
  const cards = useBoardCards(boardId);
  const t = useTheme();

  const [adding, setAdding] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [moving, setMoving] = useState<Card | null>(null);
  const { run, busy, error, setError } = useAction('wideBoard');
  const selection = useSelection(cards.data ?? EMPTY_CARDS);

  const columns = board.data?.columns ?? NO_COLUMNS;
  const members = board.data?.members ?? NO_MEMBERS;

  const byColumn = useMemo(() => {
    const map = new Map<string, Card[]>();
    for (const col of columns) map.set(col.id, cardsInColumn(cards.data ?? [], col.id));
    return map;
  }, [columns, cards.data]);


  async function addCard(columnId: string) {
    const title = newTitle.trim();
    if (!title) return;
    setNewTitle('');
    setAdding(null);
    await run(() =>
      createCard({
        boardId,
        columnId,
        title,
        user,
        columnCards: byColumn.get(columnId) ?? [],
      }),
    );
  }

  async function moveTo(card: Card, column: BoardColumn) {
    const target = (byColumn.get(column.id) ?? []).filter((c) => c.id !== card.id);
    setMoving(null);
    await run(() =>
      moveCard({
        boardId,
        card,
        toColumnId: column.id,
        before: target[target.length - 1] ?? null,
        after: null,
        user,
      }),
    );
  }

  async function removeColumn(col: BoardColumn) {
    const inCol = byColumn.get(col.id) ?? [];
    if (inCol.length > 0) {
      setError(
        `“${col.name}” still has ${inCol.length} card${inCol.length === 1 ? '' : 's'}. ` +
          'Move or archive them first.',
      );
      return;
    }
    await run(() =>
      updateBoard(boardId, columnsPatch(columns.filter((c) => c.id !== col.id))),
    );
  }

  if (board.status === 'loading' || cards.status === 'loading') {
    return <Spinner label="Loading board…" />;
  }

  const b = board.data;
  if (!b) {
    return (
      <Screen>
        <Title>Board not found</Title>
        <Button label="Back to boards" onPress={() => nav.reset({ name: 'boards' })} />
      </Screen>
    );
  }

  return (
    <Screen scroll={false} width="full">
      <Row style={styles.between}>
        <Title>{b.name}</Title>
        <Row style={styles.wrap}>
          {sessionCan.manageBoards(user) ? (
            <Button
              label="Settings"
              variant="secondary"
              onPress={() => nav.push({ name: 'boardSettings', boardId })}
            />
          ) : null}
          <Button label="Back" variant="secondary" onPress={nav.pop} />
        </Row>
      </Row>

      {error ? (
        <Panel>
          <Body>{error}</Body>
          <Button label="Dismiss" variant="secondary" onPress={() => setError(null)} />
        </Panel>
      ) : null}

      <BulkBar
        boardId={boardId}
        columns={columns}
        allCards={cards.data ?? []}
        selection={selection}
        members={members}
        user={user}
        onError={setError}
      />

      <ScrollView horizontal showsHorizontalScrollIndicator style={styles.fill}>
        {columns.map((col) => {
          const colCards = byColumn.get(col.id) ?? [];
          return (
            <View
              key={col.id}
              style={[styles.column, { backgroundColor: t.bg.inset }]}
            >
              <Row style={styles.between}>
                <Body>
                  {col.name} ({colCards.length})
                </Body>
                {sessionCan.manageBoards(user) ? (
                  <Button
                    label="✕"
                    variant="secondary"
                    onPress={() => removeColumn(col)}
                  />
                ) : null}
              </Row>

              <ScrollView style={styles.fill}>
                {colCards.sort(compareRank).map((card) => {
                  const selected = selection.isSelected(card.id);
                  return (
                    <Pressable
                      key={card.id}
                      accessibilityRole="button"
                      accessibilityLabel={card.title}
                      onPress={() =>
                        selection.active
                          ? selection.toggle(card.id)
                          : nav.push({ name: 'card', boardId, cardId: card.id })
                      }
                      onLongPress={() => selection.toggle(card.id)}
                      style={[
                        styles.card,
                        {
                          backgroundColor: selected ? t.bg.accentSoft : t.bg.surface,
                          borderColor: selected ? t.accent.base : t.border.subtle,
                          borderWidth: selected ? 2 : StyleSheet.hairlineWidth,
                        },
                      ]}
                    >
                      <Body>{card.title}</Body>
                      <Row>
                        <View
                          style={[
                            styles.dot,
                            { backgroundColor: t.priority[card.priority] },
                          ]}
                        />
                        {card.dueDate ? <Caption>{card.dueDate}</Caption> : null}
                        {card.assigneeUids.length > 0 ? (
                          <Caption>{card.assigneeUids.length} assigned</Caption>
                        ) : null}
                      </Row>
                    </Pressable>
                  );
                })}
                {colCards.length === 0 ? <Caption>No cards.</Caption> : null}
              </ScrollView>

              {adding === col.id ? (
                <>
                  <TextField
                    value={newTitle}
                    onChangeText={setNewTitle}
                    placeholder="Card title"
                    autoFocus
                    onSubmit={() => addCard(col.id)}
                  />
                  <Row>
                    <Button label="Add" onPress={() => addCard(col.id)} />
                    <Button
                      label="Cancel"
                      variant="secondary"
                      onPress={() => {
                        setAdding(null);
                        setNewTitle('');
                      }}
                    />
                  </Row>
                </>
              ) : (
                <Button
                  label="+ Add card"
                  variant="secondary"
                  onPress={() => setAdding(col.id)}
                />
              )}
            </View>
          );
        })}
      </ScrollView>

      {/* No HTML5 drag on native, so moving is explicit — the same sheet the
          narrow board uses, for the same reason: reliable beats clever. */}
      {moving ? (
        <View
          style={[
            styles.sheet,
            { backgroundColor: t.bg.raised, borderColor: t.border.strong },
          ]}
        >
          <Caption>Move “{moving.title}” to</Caption>
          <Row style={styles.wrap}>
            {columns.map((col) => (
              <Button
                key={col.id}
                label={col.name}
                disabled={col.id === moving.columnId}
                variant={col.id === moving.columnId ? 'secondary' : 'primary'}
                onPress={() => moveTo(moving, col)}
              />
            ))}
          </Row>
          <Row style={styles.wrap}>
            <Button
          busy={busy}
              label="Archive card"
              variant="danger"
              onPress={() =>
                run(async () => {
                  await archiveCard(boardId, moving.id, user);
                  setMoving(null);
                })
              }
            />
            <Button label="Cancel" variant="secondary" onPress={() => setMoving(null)} />
          </Row>
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  between: { justifyContent: 'space-between' },
  wrap: { flexWrap: 'wrap' },
  column: {
    width: 300,
    marginRight: space.md,
    borderRadius: radius.lg,
    padding: space.md,
    gap: space.sm,
  },
  card: {
    borderRadius: radius.md,
    padding: space.md,
    marginBottom: space.sm,
    gap: space.sm,
  },
  dot: { width: 10, height: 10, borderRadius: radius.pill },
  sheet: {
    position: 'absolute',
    left: space.xl,
    right: space.xl,
    bottom: space.xl,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: space.lg,
    gap: space.sm,
  },
});
