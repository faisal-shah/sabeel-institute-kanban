import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import {
  CARD_TITLE_MAX,
  columnDeleteBlocked,
  columnsPatch,
  subtaskCounts,
  compareRank,
  type BoardColumn,
  type BoardLabel,
} from '@sabeel/shared';
import {
  archiveCard,
  cardsInColumn,
  createCard,
  moveCard,
  useBoardCards,
  type Card,
} from '../../cards';
import { updateBoard, useBoard, type BoardMemberProfile } from '../../boards';
import { CardFace } from '../CardFace';
import { ColumnNameEditor } from '../ColumnNameEditor';
import { useSelection } from '../../useSelection';
import { BulkBar } from '../BulkBar';
import { sessionCan, type SessionUser } from '../../session';
import { useNav } from '../../nav';
import {
  Body,
  Button,
  Caption,
  Hint,
  IconAction,
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
const NO_LABELS: BoardLabel[] = [];

export function WideBoard({ boardId, user }: { boardId: string; user: SessionUser }) {
  const nav = useNav();
  const board = useBoard(boardId);
  const cards = useBoardCards(boardId);
  const t = useTheme();

  const [adding, setAdding] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [moving, setMoving] = useState<Card | null>(null);
  // Which column is mid-rename — its delete icon steps aside while editing, so
  // the cancel ✕ and the delete ✕ are never adjacent.
  const [renamingCol, setRenamingCol] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<BoardColumn | null>(null);
  const { run, busy, error, setError } = useAction('wideBoard');
  const selection = useSelection(cards.data ?? EMPTY_CARDS);

  const columns = board.data?.columns ?? NO_COLUMNS;
  const members = board.data?.members ?? NO_MEMBERS;
  const labels = board.data?.labels ?? NO_LABELS;

  // Derived, not stored: every card of the board is already loaded, so the count
  // costs nothing and can never drift from reality.
  const subtasksBy = useMemo(() => subtaskCounts(cards.data ?? EMPTY_CARDS), [cards.data]);

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
        card,
        toColumnId: column.id,
        before: target[target.length - 1] ?? null,
        after: null,
        user,
      }),
    );
  }

  /**
   * Deleting a column is irreversible and sits one tap away, so it ASKS.
   * Emptiness is not consent — an empty column can still be one someone just
   * cleared and is about to refill.
   */
  function askRemoveColumn(col: BoardColumn) {
    const blocked = columnDeleteBlocked(col.name, (byColumn.get(col.id) ?? []).length);
    if (blocked) {
      setError(blocked);
      return;
    }
    setPendingDelete(col);
  }

  async function confirmRemoveColumn(col: BoardColumn) {
    setPendingDelete(null);
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
        <Title numberOfLines={1} style={styles.headerTitle}>
          {b.name}
        </Title>
        <Row style={styles.headerActions}>
          {/* Everyone gets this, not just managers: members can archive, so
              members must be able to un-archive. */}
          <IconAction
            icon="inventory-2"
            label="Archived cards"
            onPress={() => nav.push({ name: 'boardArchive', boardId })}
          />
          {sessionCan.manageBoards(user) ? (
            <IconAction
              icon="settings"
              label="Board settings"
              onPress={() => nav.push({ name: 'boardSettings', boardId })}
            />
          ) : null}
          <IconAction icon="arrow-back" label="Back" onPress={nav.pop} />
        </Row>
      </Row>

      {error ? (
        <Panel>
          <Body>{error}</Body>
          <Button label="Dismiss" variant="secondary" onPress={() => setError(null)} />
        </Panel>
      ) : null}

      {/* Destructive and irreversible, so it gets a labelled button and a
          sentence — not an icon you can brush past. */}
      {pendingDelete ? (
        <Panel>
          <Body>
            Delete the column “{pendingDelete.name}”? It is empty, but this cannot
            be undone.
          </Body>
          <Row>
            <Button
              busy={busy}
              label="Delete column"
              variant="danger"
              onPress={() => confirmRemoveColumn(pendingDelete)}
            />
            <Button
              label="Cancel"
              variant="secondary"
              onPress={() => setPendingDelete(null)}
            />
          </Row>
        </Panel>
      ) : null}

      <BulkBar
        currentBoardId={boardId}
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
                <ColumnNameEditor
                  column={col}
                  columns={columns}
                  canEdit={sessionCan.manageBoards(user)}
                  suffix={` (${colCards.length})`}
                  bold
                  busy={busy}
                  onError={setError}
                  onRename={(next) =>
                    run(() => updateBoard(boardId, columnsPatch(next)))
                  }
                  onEditingChange={(on) => setRenamingCol(on ? col.id : null)}
                />
                {sessionCan.manageBoards(user) && renamingCol !== col.id ? (
                  <IconAction
                    icon="close"
                    label={`Delete column ${col.name}`}
                    danger
                    onPress={() => askRemoveColumn(col)}
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
                      <CardFace
                        card={card}
                        boardLabels={labels}
                        boardMembers={members}
                        subtaskCount={subtasksBy.get(card.id)}
                      />
                    </Pressable>
                  );
                })}
                {colCards.length === 0 ? <Hint>No cards.</Hint> : null}
              </ScrollView>

              {adding === col.id ? (
                <>
                  <TextField
                    value={newTitle}
                    onChangeText={setNewTitle}
                    placeholder="Card title"
                    autoFocus
                    maxLength={CARD_TITLE_MAX}
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
                  await archiveCard(moving.id, user);
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
  headerTitle: { flexShrink: 1 },
  // Small: IconAction's 44px box already separates these.
  headerActions: { gap: space.xs },
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
