/**
 * The NARROW board: one column at a time, swipe between them.
 *
 * Chosen by available WIDTH, not platform — a phone browser gets this too, and
 * a tablet does not. See app/src/theme/layout.ts.
 *
 * This is the layout decision the whole project turns on — a phone cannot show a
 * multi-column board legibly, and a horizontally-scrolling miniature is worse
 * than useless on the move. So the column fills the screen, cards stay readable,
 * and the board's shape is conveyed by a position indicator instead.
 *
 * Moving a card is an explicit "Move to…" sheet rather than a drag. On a
 * swipe-paged surface a drag gesture is ambiguous: the same finger movement
 * means both "drag this card" and "next column". Reordering WITHIN a column has
 * no such conflict, so that stays a long-press drag.
 *
 * The web board is a different component entirely (BoardScreen.web.tsx).
 */
import { useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { columnsPatch, type BoardColumn } from '@sabeel/shared';
import {
  cardsInColumn,
  createCard,
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
  Hint,
  Card as Panel,
  Row,
  Screen,
  Spinner,
  TextField,
  Title,
} from '../ui';
import { radius, space, type, useTheme } from '../../theme';
import { KeyboardSticky } from '../KeyboardSticky';
import { useAction } from '../../useAction';

/** Stable empties, so an absent board does not churn the memos below. */
const NO_COLUMNS: BoardColumn[] = [];
const EMPTY_CARDS: Card[] = [];
const NO_MEMBERS: BoardMemberProfile[] = [];

function CardTile({
  card,
  selected,
  selectionActive,
  onOpen,
  onLongPress,
}: {
  card: Card;
  selected: boolean;
  selectionActive: boolean;
  onOpen: () => void;
  onLongPress: () => void;
}) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onOpen}
      onLongPress={onLongPress}
      accessibilityRole="button"
      accessibilityLabel={selected ? `${card.title}, selected` : card.title}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: selected ? t.bg.accentSoft : t.bg.surface,
          borderColor: selected ? t.accent.base : t.border.subtle,
          borderWidth: selected ? 2 : StyleSheet.hairlineWidth,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <Body>{card.title}</Body>
      <Row>
        <View style={[styles.dot, { backgroundColor: t.priority[card.priority] }]} />
        {card.dueDate ? <Caption>{card.dueDate}</Caption> : null}
        {card.assigneeUids.length > 0 ? (
          <Caption>{card.assigneeUids.length} assigned</Caption>
        ) : null}
        {selectionActive ? (
          <Caption>{selected ? '✓ selected' : 'tap to select'}</Caption>
        ) : null}
      </Row>
    </Pressable>
  );
}

/**
 * Which column each board was last showing.
 *
 * Module-level on purpose: this must survive the component unmounting, which is
 * exactly what happens when you open a card. Bounded implicitly by the number of
 * boards, which is small.
 */
const lastPageByBoard = new Map<string, number>();

export function NarrowBoard({ boardId, user }: { boardId: string; user: SessionUser }) {
  const nav = useNav();
  const board = useBoard(boardId);
  const cards = useBoardCards(boardId);

  // Remembered PER BOARD, outside the component. The pager's position was
  // component state, so opening a card unmounted the board and lost it —
  // returning from a card in the third column dumped you back on the first.
  // Keyed by board so two boards do not inherit each other's position.
  const [page, setPage] = useState(() => lastPageByBoard.get(boardId) ?? 0);
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const { run, error, setError } = useAction('narrowBoard');
  const scroller = useRef<ScrollView>(null);
  // Measured, not Dimensions.get('window'): this pager sits inside the Screen's
  // horizontal padding, so sizing pages to the WINDOW made every page wider than
  // the space available and pushed cards (and the column footer) off the right
  // edge. Measuring also keeps it correct if it is ever nested elsewhere, and it
  // tracks browser resizes for free.
  //
  // ONE source of truth, deliberately. A previous version fell back to
  // window-width-minus-padding until the measurement arrived, as insurance
  // against a blank board. That was a mistake: `syncPage` derives the current
  // page from `contentOffset.x / width`, so two different widths in play meant
  // the division could produce a page the user never navigated to — the board
  // jumped from column 2 to column 7 while opening the add-card form, and sat
  // between two columns showing half of each. The blank board it was insuring
  // against had a different cause (a flex:1 chain broken in Screen) and is fixed
  // there. Insurance that corrupts the thing it protects is not insurance.
  const [width, setWidth] = useState(0);
  const selection = useSelection(cards.data ?? EMPTY_CARDS);

  // Members come from the BOARD, not the user directory: only admins may list
  // users, so reading the directory here would show every non-admin a
  // permission-denied banner and leave them unable to assign anyone.
  const members = board.data?.members ?? NO_MEMBERS;

  // `?? []` would allocate a new array each render, defeating the memo below.
  const columns = board.data?.columns ?? NO_COLUMNS;
  const byColumn = useMemo(() => {
    const map = new Map<string, Card[]>();
    for (const col of columns) map.set(col.id, cardsInColumn(cards.data ?? [], col.id));
    return map;
  }, [columns, cards.data]);

  /**
   * Keep the position indicator in step with the visible column.
   *
   * `onMomentumScrollEnd` alone is not enough: a slow drag that releases without
   * flinging produces no momentum event, so the header would still say "To Do,
   * 1 of 3" while the Done column is on screen — observed on the emulator
   * 2026-07-19. Tracking `onScroll` as well means the indicator can never
   * disagree with what the user is looking at, which is the whole point of
   * having it on a surface where only one column is visible.
   */
  function rememberPage(next: number) {
    lastPageByBoard.set(boardId, next);
    setPage(next);
  }

  function syncPage(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const next = Math.round(e.nativeEvent.contentOffset.x / width);
    if (next !== page && next >= 0 && next < columns.length) rememberPage(next);
  }

  function goTo(index: number) {
    const clamped = Math.max(0, Math.min(index, columns.length - 1));
    rememberPage(clamped);
    scroller.current?.scrollTo({ x: clamped * width, animated: true });
  }


  async function addCard(columnId: string) {
    const title = newTitle.trim();
    if (!title) return;
    setNewTitle('');
    setAdding(false);
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
        <Hint>It may have been archived, or you may not be a member.</Hint>
        <Button label="Back to boards" onPress={() => nav.reset({ name: 'boards' })} />
      </Screen>
    );
  }

  const current = columns[page];

  return (
    <Screen scroll={false}>
      <Row style={styles.between}>
        <Title>{b.name}</Title>
        <Row>
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

      {/* Column pager header: which column, and where it sits in the board. */}
      <Row style={styles.pager}>
        <Button label="‹ Prev" variant="secondary" onPress={() => goTo(page - 1)} />
        <View style={styles.pagerLabel}>
          <Body>{current?.name ?? '—'}</Body>
          <Caption>
            {columns.length > 0 ? `${page + 1} of ${columns.length}` : 'No columns'}
          </Caption>
        </View>
        <Button label="Next ›" variant="secondary" onPress={() => goTo(page + 1)} />
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

      {!selection.active && (byColumn.get(current?.id ?? '')?.length ?? 0) > 0 ? (
        <Caption>
          Tap a card to open it. Long-press to start selecting, then tap others
          to move or archive them together.
        </Caption>
      ) : null}

      <ScrollView
        ref={scroller}
        onLayout={(e) => {
          const w = e.nativeEvent.layout.width;
          if (w > 0 && Math.abs(w - width) > 1) {
            setWidth(w);
            // Restore the remembered column once we know how wide a page is.
            // Without this the state says "column 3" while the ScrollView is
            // still at offset 0, which is the desync that showed half of two
            // columns at once.
            if (page > 0) {
              requestAnimationFrame(() =>
                scroller.current?.scrollTo({ x: page * w, animated: false }),
              );
            }
          }
        }}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={syncPage}
        onMomentumScrollEnd={syncPage}
        onScrollEndDrag={syncPage}
        scrollEventThrottle={32}
        style={styles.fill}
      >
        {(width === 0 ? [] : columns).map((col) => {
          const colCards = byColumn.get(col.id) ?? [];
          return (
            <View key={col.id} style={[styles.page, { width }]}>
              <FlatList
                data={colCards}
                keyExtractor={(c) => c.id}
                renderItem={({ item }) => (
                  <CardTile
                    card={item}
                    selected={selection.isSelected(item.id)}
                    selectionActive={selection.active}
                    // Once anything is selected, tapping toggles rather than
                    // opens — otherwise building a selection means alternating
                    // between long-press and tap, which nobody discovers.
                    onOpen={() =>
                      selection.active
                        ? selection.toggle(item.id)
                        : nav.push({ name: 'card', boardId, cardId: item.id })
                    }
                    onLongPress={() => selection.toggle(item.id)}
                  />
                )}
                ListEmptyComponent={<Hint>No cards in {col.name}.</Hint>}
                contentContainerStyle={styles.listContent}
              />

              {/* ONLY the visible column gets a composer.
                  `adding` is one boolean for the whole board, so rendering the
                  form on every page created one autoFocus TextField PER COLUMN.
                  The last one to mount won focus, and Android then scrolled the
                  horizontal pager to reveal that focused input — the board
                  jumped from column 1 to column 7 the moment you tapped "+ Add
                  card", landing between pages with two forms side by side. */}
              {adding && col.id === current?.id ? (
                /* Lifted above the keyboard: this composer is pinned to the
                   bottom of a NON-scrolling screen, so nothing can scroll it
                   into view and the keyboard simply covered the field. */
                <KeyboardSticky>
                  <Panel>
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
                          setAdding(false);
                          setNewTitle('');
                        }}
                      />
                    </Row>
                  </Panel>
                </KeyboardSticky>
              ) : (
                <Row style={[styles.footer, styles.wrap]}>
                  <View style={styles.grow}>
                    <Button label="+ Add card" onPress={() => setAdding(true)} />
                  </View>
                  {sessionCan.manageBoards(user) ? (
                    <Button
                      label="Delete column"
                      variant="secondary"
                      onPress={() => removeColumn(col)}
                    />
                  ) : null}
                </Row>
              )}
            </View>
          );
        })}
      </ScrollView>


    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  between: { justifyContent: 'space-between' },
  grow: { flex: 1 },
  pager: { justifyContent: 'space-between', paddingVertical: space.sm },
  pagerLabel: { alignItems: 'center', flex: 1 },
  page: { paddingHorizontal: space.xs, gap: space.sm },
  listContent: { paddingBottom: space.md, gap: space.sm },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    padding: space.md,
    gap: space.sm,
  },
  dot: { width: 10, height: 10, borderRadius: radius.pill },
  footer: { gap: space.sm },
  wrap: { flexWrap: 'wrap' },
  sheet: {
    position: 'absolute',
    left: space.lg,
    right: space.lg,
    bottom: space.lg,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: space.lg,
    gap: space.sm,
    ...type.body,
  },
});
