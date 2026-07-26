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
import {
  CARD_TITLE_MAX,
  columnDeleteBlocked,
  columnsPatch,
  subtaskCounts,
  type BoardColumn,
  type BoardLabel,
} from '@sabeel/shared';
import {
  cardsInColumn,
  createCard,
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
  Card as Panel,
  Hint,
  IconAction,
  LoadError,
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
const NO_LABELS: BoardLabel[] = [];

function CardTile({
  card,
  boardLabels,
  boardMembers,
  subtaskCount,
  selected,
  selectionActive,
  onOpen,
  onLongPress,
}: {
  card: Card;
  boardLabels: readonly BoardLabel[];
  boardMembers: readonly BoardMemberProfile[];
  subtaskCount?: number;
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
      <CardFace
        card={card}
        boardLabels={boardLabels}
        boardMembers={boardMembers}
        subtaskCount={subtaskCount}
      />
      {selectionActive ? (
        <Caption>{selected ? '✓ selected' : 'tap to select'}</Caption>
      ) : null}
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
  const { run, busy, error, setError } = useAction('narrowBoard');
  // Editing the column name takes over the pager row (see the header below).
  const [renaming, setRenaming] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<BoardColumn | null>(null);
  // Has the pager been scrolled to the remembered column yet? Starts true when
  // there is nothing to restore, so the common case paints immediately.
  const [restored, setRestored] = useState(() => (lastPageByBoard.get(boardId) ?? 0) === 0);
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
  const labels = board.data?.labels ?? NO_LABELS;

  // `?? []` would allocate a new array each render, defeating the memo below.
  const columns = board.data?.columns ?? NO_COLUMNS;
  // Derived, not stored — the board already holds every card it needs.
  const subtasksBy = useMemo(() => subtaskCounts(cards.data ?? EMPTY_CARDS), [cards.data]);

  const byColumn = useMemo(() => {
    const map = new Map<string, Card[]>();
    for (const col of columns) map.set(col.id, cardsInColumn(cards.data ?? [], col.id));
    return map;
  }, [columns, cards.data]);

  // Is there actually a column to scroll back to? False when the pager is
  // already on the first page, and — the corner case — when the remembered page
  // no longer exists because columns were deleted since. Both mean "show it now".
  const needsRestore = page > 0 && page < columns.length;

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
  // A failed cards query used to render a board with every column and no
  // cards at all — indistinguishable from someone having deleted the lot.
  // Inside a Screen WITH a way out: a bare panel on the immersive board
  // (no tab bar, no header) left the reader stranded with no Back.
  if (cards.status === 'error') {
    return (
      <Screen>
        <Row style={styles.between}>
          <Title numberOfLines={1} style={styles.headerTitle}>
            {board.data?.name ?? 'Board'}
          </Title>
          <IconAction icon="arrow-back" label="Back" onPress={nav.pop} />
        </Row>
        <LoadError what="this board" code={cards.error} />
      </Screen>
    );
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
        {/* The title shrinks and truncates so the icons keep their place —
            a long board name used to shove them off the row. */}
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

      {/* Column pager header: which column, and where it sits in the board.
          While the name is being edited the Prev/Next buttons step aside — on a
          phone they leave barely 130px between them, which is not a text field
          you can type a column name into. */}
      <Row style={styles.pager}>
        {!renaming ? (
          <Button label="‹ Prev" variant="secondary" onPress={() => goTo(page - 1)} />
        ) : null}
        <View style={styles.pagerLabel}>
          {current ? (
            <ColumnNameEditor
              column={current}
              columns={columns}
              canEdit={sessionCan.manageBoards(user)}
              center
              // Two lines here and nowhere else: the pager squeezes the name
              // between Prev and Next, and there is nothing above or below it
              // to displace.
              lines={2}
              busy={busy}
              onError={setError}
              onEditingChange={setRenaming}
              onRename={(next) => run(() => updateBoard(boardId, columnsPatch(next)))}
            />
          ) : (
            <Body>—</Body>
          )}
          {!renaming ? (
            <Caption>
              {columns.length > 0 ? `${page + 1} of ${columns.length}` : 'No columns'}
            </Caption>
          ) : null}
        </View>
        {!renaming ? (
          <Button label="Next ›" variant="secondary" onPress={() => goTo(page + 1)} />
        ) : null}
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

      {!selection.active && (byColumn.get(current?.id ?? '')?.length ?? 0) > 0 ? (
        <Caption>
          Tap a card to open it. Long-press to start selecting, then tap others
          to move or archive them together.
        </Caption>
      ) : null}

      {/* The pager is MEASURED by this wrapper, not by the ScrollView itself, so
          the ScrollView can be mounted already knowing how wide a page is.

          That ordering is the whole fix for a bug caught on video: the header
          reads from the restored `page` immediately, but the scroll position was
          restored afterwards (a scrollTo inside onLayout, deferred a frame). For
          that window the header said "Feature Requests, 2 of 5" while the body
          still showed column 1 — which happened to be empty, so coming back from
          a card detail read as "my cards have vanished".

          Mounting late means `contentOffset` is an INITIAL prop, which is the
          only form of it every platform honours; setting it on an already-mounted
          ScrollView is not reliably applied. The rAF scrollTo stays as a
          belt-and-braces correction for a width CHANGE (rotation, browser
          resize), where the ScrollView is necessarily already mounted. */}
      <View style={styles.fill} onLayout={(e) => {
        const w = e.nativeEvent.layout.width;
        if (w > 0 && Math.abs(w - width) > 1) {
          const hadWidth = width > 0;
          setWidth(w);
          if (hadWidth && page > 0) {
            requestAnimationFrame(() =>
              scroller.current?.scrollTo({ x: page * w, animated: false }),
            );
          }
        }
      }}>
      {width === 0 ? null : (
      <ScrollView
        ref={scroller}
        // Restore the remembered column when the CONTENT has been measured.
        // `contentOffset` alone is not enough — Android does not honour it here —
        // and a scrollTo from onLayout runs before the pages exist, so it lands
        // nowhere. onContentSizeChange fires once the pages are laid out, which
        // is the first moment a scroll can actually take effect.
        onContentSizeChange={() => {
          if (!needsRestore || restored) return;
          scroller.current?.scrollTo({ x: page * width, animated: false });
          setRestored(true);
        }}
        // Held invisible until it is sitting on the right column. Showing the
        // WRONG column is far worse than showing nothing for a frame: the header
        // says "Feature Requests, 2 of 5" while the body renders column 1, and if
        // that column is empty it reads as "my cards are gone" — which is exactly
        // what got filmed coming back from a card detail.
        //
        // Gated on `needsRestore`, never on `restored` alone. If the remembered
        // page no longer exists — columns deleted since you were last here — the
        // ScrollView has nothing to scroll to, `onContentSizeChange` may never
        // fire, and gating on `restored` would leave the board PERMANENTLY blank.
        // Nothing to restore means show it immediately.
        style={[styles.fill, needsRestore && !restored ? styles.hidden : null]}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={syncPage}
        onMomentumScrollEnd={syncPage}
        onScrollEndDrag={syncPage}
        scrollEventThrottle={32}
      >
        {columns.map((col) => {
          const colCards = byColumn.get(col.id) ?? [];
          return (
            <View key={col.id} style={[styles.page, { width }]}>
              <FlatList
                // Bounded, so it SCROLLS rather than growing past the page and
                // being clipped. See styles.page.
                style={styles.fill}
                data={colCards}
                keyExtractor={(c) => c.id}
                renderItem={({ item }) => (
                  <CardTile
                    card={item}
                    boardLabels={labels}
                    boardMembers={members}
                    subtaskCount={subtasksBy.get(item.id)}
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
                      maxLength={CARD_TITLE_MAX}
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
                      onPress={() => askRemoveColumn(col)}
                    />
                  ) : null}
                </Row>
              )}
            </View>
          );
        })}
      </ScrollView>
      )}
      </View>

    </Screen>
  );
}

const styles = StyleSheet.create({
  hidden: { opacity: 0 },
  fill: { flex: 1 },
  between: { justifyContent: 'space-between' },
  headerTitle: { flexShrink: 1 },
  // Small: IconAction's 44px box already separates these.
  headerActions: { gap: space.xs },
  grow: { flex: 1 },
  pager: { justifyContent: 'space-between', paddingVertical: space.sm },
  pagerLabel: { alignItems: 'center', flex: 1 },
  /**
   * A column page is a flex COLUMN that fills the pager, so the card list can be
   * given the leftover space and the action row can sit under it.
   *
   * Without `flex: 1` here (and `fill` on the list) react-native-web sized the
   * list to its CONTENT: past about ten cards the column overflowed the page,
   * which clips (`overflow: hidden` on a View), so the last card was sliced in
   * half, "+ Add card" was pushed off the bottom of the screen, and NOTHING
   * scrolled — the wheel did nothing because no element had scrollable overflow.
   * The same tree behaved on native, which is why it only ever showed up in the
   * browser. It also explains why the action row appeared directly beneath the
   * cards on web but pinned to the bottom on Android: a content-sized list
   * leaves no space to push it down.
   */
  page: { flex: 1, paddingHorizontal: space.xs, gap: space.sm },
  listContent: { paddingBottom: space.md, gap: space.sm },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    padding: space.md,
    gap: space.sm,
  },
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
