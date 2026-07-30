import { useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { collection, getDocs, query, where } from 'firebase/firestore';
import {
  filterCards,
  hasActiveFilters,
  rankMatches,
  todayInOrgTz,
  toPlainText,
  sortLabels,
  type Label,
  type SearchableCard,
} from '@sabeel/shared';
import { db } from '../firebase';
import { useLabels } from '../labels';
import { useMyBoards, type BoardListItem, type BoardMemberProfile } from '../boards';
import type { SessionUser } from '../session';
import { useNav } from '../nav';
import {
  clearSearchFilters,
  labelChips,
  setSearchFilters,
  useSearchFilters,
} from '../searchFilters';
import {
  Body,
  Hint,
  CardGrid,
  FilterChip,
  IconAction,
  Card as Panel,
  Heading,
  Row,
  Screen,
  Spinner,
  TextField,
  Title,
} from '../components/ui';
import { CardFace } from '../components/CardFace';
import { Sheet, SheetOption } from '../components/Sheet';
import { space } from '../theme';
import { useLayout } from '../theme/layout';

/** A quiet divider inside the Filters sheet — the shape AppNav's More menu uses. */
function MenuSection({ label }: { label: string }) {
  return <Hint>{label.toUpperCase()}</Hint>;
}

const NO_LABELS: Label[] = [];
const NO_MEMBERS: BoardMemberProfile[] = [];

/**
 * Search across every board you belong to.
 *
 * Firestore has no full-text search, so this fans out one lightweight query per
 * member board and matches in memory. At this team's scale that is instant, and
 * it works offline over boards already cached. See @sabeel/shared/search for the
 * honest limits.
 *
 * Deliberately a ONE-SHOT fetch rather than a live subscription: search results
 * shifting under your finger while you read them is worse than slightly stale
 * ones, and N live listeners across every board would be a real cost.
 */
export function SearchScreen({ user }: { user: SessionUser }) {
  const nav = useNav();
  const { isWide } = useLayout();
  const boards = useMyBoards(user);
  const allLabels = useLabels();

  /**
   * The filters live OUTSIDE this component (see `../searchFilters`).
   *
   * Opening a card unmounts this screen, so anything held in `useState` here was
   * gone by the time you pressed Back — the text, the chips, the labels. Back is
   * meant to return you to what you were looking at.
   */
  const { text, archivedOnly, overdueOnly, priority, labelIds, boardId } =
    useSearchFilters();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [cards, setCards] = useState<SearchableCard[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const boardIds = useMemo(
    () => (boards.data ?? []).map((b) => b.id).join(','),
    [boards.data],
  );
  const boardById = useMemo(() => {
    const m = new Map<string, BoardListItem>();
    for (const b of boards.data ?? []) m.set(b.id, b);
    return m;
  }, [boards.data]);

  // Load card metadata for the user's boards, then filter in memory as they
  // type — refetching per keystroke would be pointless traffic. This used to be
  // ONE query per board; consolidating to a `boardId in [...]` query cuts it to a
  // handful of round trips, and archived cards are dropped server-side unless the
  // toggle asks for them, instead of fetching every card ever and filtering.
  useEffect(() => {
    let cancelled = false;
    const ids = boardIds ? boardIds.split(',') : [];
    if (ids.length === 0) {
      setCards([]);
      return;
    }

    setLoading(true);
    // Firestore `in` takes at most 30 values, so chunk — still far fewer queries
    // than one per board. Uses the (boardId, archived, rank) index's prefix.
    const chunks: string[][] = [];
    for (let i = 0; i < ids.length; i += 30) chunks.push(ids.slice(i, i + 30));

    Promise.all(
      chunks.map((chunk) => {
        const filters = [where('boardId', 'in', chunk)];
        // Constrain to ONE archive state, never both. The chip narrows the
        // results like every other chip, and this also fetches strictly less.
        filters.push(where('archived', '==', archivedOnly));
        return getDocs(query(collection(db, 'cards'), ...filters)).then((snap) =>
          snap.docs.map<SearchableCard>((d) => ({
            id: d.id,
            boardId: (d.data().boardId as string) ?? '',
            title: (d.data().title as string) ?? '',
            description: (d.data().description as string) ?? '',
            // Stripped ONCE here. `matchesText` would otherwise re-parse every
            // description on every keystroke.
            descriptionPlain: toPlainText((d.data().description as string) ?? ''),
            columnId: (d.data().columnId as string) ?? '',
            assigneeUids: (d.data().assigneeUids as string[]) ?? [],
            labelIds: (d.data().labelIds as string[]) ?? [],
            priority: d.data().priority ?? 'none',
            dueDate: d.data().dueDate as string | undefined,
            archived: Boolean(d.data().archived),
            updatedAt: (d.data().updatedAt as number) ?? 0,
          })),
        );
      }),
    )
      .then((per) => {
        if (!cancelled) setCards(per.flat());
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [boardIds, archivedOnly]);

  // Split the org-wide set into what is already filtering and what the picker
  // can still offer. Sorted the way the rest of the app sorts labels, so an
  // emoji-prefixed name files under its word rather than under the emoji.
  /**
   * A chip for every chosen label id — INCLUDING one whose label no longer
   * exists.
   *
   * This used to filter the org-wide set down to the chosen ids, so an id that
   * resolved to nothing produced no chip at all while still narrowing the
   * results. `deleteLabel` makes that reachable: a manager deletes a label you
   * are filtering by, and Search silently goes empty with no cause on screen and
   * nothing to tap. The rule is that EVERY active filter is visible and
   * removable, so an unresolvable one still gets a chip.
   */
  const chosenLabels = useMemo(
    () => labelChips(labelIds, allLabels.data ?? NO_LABELS, sortLabels),
    [allLabels.data, labelIds],
  );
  const offerableLabels = useMemo(
    () => sortLabels((allLabels.data ?? []).filter((l) => !labelIds.includes(l.id))),
    [allLabels.data, labelIds],
  );

  const boardList = useMemo(
    () => [...(boards.data ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
    [boards.data],
  );
  /**
   * Same rule for the board. A board can be ARCHIVED while it is selected, which
   * drops it out of `useMyBoards` — and out of the fetch — so the filter would
   * keep narrowing to a board whose chip had disappeared.
   */
  const boardName = boardId
    ? (boardById.get(boardId)?.name ?? 'Unavailable board')
    : undefined;

  /**
   * Whether anything is narrowing the results — the ONE condition the clear
   * control appears on. `hasActiveFilters` already answers this in
   * `@sabeel/shared` and now counts the board too, so the button cannot drift
   * out of step with what the filters actually do.
   */
  const anyActive = hasActiveFilters({
    text,
    archivedOnly,
    priority,
    labelIds,
    boardId,
    due: overdueOnly ? 'overdue' : undefined,
  });

  // Search BROWSES by default: with no text and no chips it lists everything you
  // can see, newest first. It used to show nothing until you typed, which meant
  // the only route to an archived card was knowing its name — you cannot search
  // for something you are trying to find.
  //
  // Everything is filtered in memory over the cards already fetched, reusing the
  // filters in @sabeel/shared that were written and tested for this and never
  // surfaced. Deliberately simple for the size this actually is (tens of cards):
  // the honest limit is the CAP below, which says out loud when it is hiding
  // something rather than silently truncating.
  const { results, total } = useMemo(() => {
    if (!cards) return { results: [], total: 0 };
    const today = todayInOrgTz();
    const matched = filterCards(
      cards,
      {
        text,
        archivedOnly,
        priority,
        labelIds,
        boardId,
        due: overdueOnly ? 'overdue' : undefined,
      },
      today,
    );
    // With a query, rank by relevance. Without one, the useful order is what
    // changed most recently — "what has been happening across my boards".
    const ordered = text.trim()
      ? rankMatches(matched, text)
      : [...matched].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
    return { results: ordered.slice(0, RESULT_CAP), total: ordered.length };
  }, [cards, text, archivedOnly, priority, overdueOnly, labelIds, boardId]);

  return (
    <Screen width="list">
      {/* No Back button: Search is a tab root reached from the nav bar. */}
      <Title>Search</Title>

      {/* The search box and its toggle are a form: keep them a comfortable width
          rather than stretched across the results grid. */}
      <View style={styles.searchBar}>
        <TextField
          value={text}
          onChangeText={(v) => setSearchFilters({ text: v })}
          placeholder="Search cards across your boards"
          // DESKTOP only — which is a width question, not a platform one.
          //
          // Search browses by default now, so a keyboard opening straight over
          // the list the screen exists to show is the bug. On a desktop there is
          // no keyboard to be in the way and Search is a screen you open in
          // order to type, so the cursor is a courtesy.
          //
          // `Platform.OS === 'web'` alone is NOT that distinction: a phone
          // browser is web too, and several colleagues use the app exactly that
          // way, so autofocus opened the on-screen keyboard for them — the
          // native case was fixed and the one it was fixed for was not.
          autoFocus={Platform.OS === 'web' && isWide}
        />

        {/* Two rows, and the split is deliberate.
            The BINARY toggles stay one tap — Archived most of all, since Search
            is the way to the archive. The two UNBOUNDED lists, board and label,
            live behind one control instead of becoming two more dropdowns
            stacked under the box; whatever they select comes back as a chip in
            the same row, removable by the same gesture as everything else. */}
        <Row style={styles.chips}>
          <FilterChip
            label="Archived"
            active={archivedOnly}
            onPress={() => setSearchFilters((f) => ({ archivedOnly: !f.archivedOnly }))}
          />
          <FilterChip
            label="Overdue"
            active={overdueOnly}
            onPress={() => setSearchFilters((f) => ({ overdueOnly: !f.overdueOnly }))}
          />
          {(['urgent', 'high'] as const).map((p) => (
            <FilterChip
              key={p}
              label={p === 'urgent' ? 'Urgent' : 'High'}
              active={priority === p}
              onPress={() =>
                setSearchFilters((f) => ({ priority: f.priority === p ? undefined : p }))
              }
            />
          ))}
        </Row>

        <Row style={styles.chips}>
          {/* An ACTION, not a toggle: it opens the picker below. `active` stayed
              false because lighting it while the sheet is open describes a state
              nobody sees (the sheet covers it), and whatever gets picked already
              shows as its own chip beside this one. The label is overridden for
              the same reason — "Filters filter, off" announces a filter state
              this control does not have. */}
          <FilterChip
            label="Filters"
            active={false}
            accessibilityLabel="Filters"
            onPress={() => setFiltersOpen(true)}
          />
          {/* The board reads as a chip like the rest, so the answer to "what am
              I filtering by?" is one row rather than scattered across controls. */}
          {boardName ? (
            <FilterChip
              label={boardName}
              active
              onPress={() => setSearchFilters({ boardId: undefined })}
            />
          ) : null}
          {chosenLabels.map((l) => (
            <FilterChip
              key={l.id}
              label={l.name}
              active
              onPress={() =>
                setSearchFilters((f) => ({
                  labelIds: f.labelIds.filter((id) => id !== l.id),
                }))
              }
            />
          ))}
          {/* Only ever present when there is something to clear, so it is never
              a dead control — and an icon, per the standing rule. */}
          {anyActive ? (
            <IconAction
              icon="filter-alt-off"
              label="Clear all filters"
              onPress={clearSearchFilters}
            />
          ) : null}
        </Row>
      </View>

      {/* One home for the two filters that are LISTS.
          A board dropdown beside a label dropdown would have been five stacked
          controls above the results and no single answer to "what am I
          filtering by". Both live here; both answer in the chip row above. */}
      <Sheet visible={filtersOpen} title="Filters" onClose={() => setFiltersOpen(false)}>
        <MenuSection label="Board" />
        <SheetOption
          label="All boards"
          selected={!boardId}
          onPress={() => {
            setSearchFilters({ boardId: undefined });
            setFiltersOpen(false);
          }}
        />
        {boardList.map((b) => (
          <SheetOption
            key={b.id}
            label={b.name}
            selected={boardId === b.id}
            onPress={() => {
              setSearchFilters({ boardId: b.id });
              setFiltersOpen(false);
            }}
          />
        ))}

        <MenuSection label="Label" />
        {/* Only ever offers what is NOT already chosen, so the list shrinks as
            you go. A card matches ANY of them — requiring all would empty the
            results on the second pick. */}
        {offerableLabels.length === 0 ? (
          <Hint>
            {(allLabels.data ?? []).length === 0
              ? 'No labels have been created yet.'
              : 'Every label is already being filtered by.'}
          </Hint>
        ) : (
          offerableLabels.map((l) => (
            <SheetOption
              key={l.id}
              label={l.name}
              onPress={() => {
                setSearchFilters((f) => ({ labelIds: [...f.labelIds, l.id] }));
                setFiltersOpen(false);
              }}
            />
          ))
        )}
      </Sheet>

      {error ? (
        <Panel style={styles.searchBar}>
          <Body>{error}</Body>
        </Panel>
      ) : null}

      {loading || cards === null ? <Spinner label="Loading your cards…" /> : null}

      {!loading && cards !== null ? (
        <>
          <Heading>
            {total === 0
              ? 'Nothing to show'
              : text.trim()
                ? `${total} match${total === 1 ? '' : 'es'}`
                : `${total} card${total === 1 ? '' : 's'}`}
          </Heading>
          {total > RESULT_CAP ? (
            <Hint>
              Showing the first {RESULT_CAP}. Narrow it with a filter or a search
              term.
            </Hint>
          ) : null}
        </>
      ) : null}

      <CardGrid>
        {results.map((c) => {
          const board = boardById.get(c.boardId);
          return (
            <Pressable
              key={`${c.boardId}/${c.id}`}
              // Same handle the board tiles carry, so a test can open a card by
              // title on either surface rather than needing two idioms.
              testID={`card-${c.title}`}
              accessibilityRole="button"
              accessibilityLabel={c.title}
              onPress={() => nav.push({ name: 'card', boardId: c.boardId, cardId: c.id })}
            >
              <Panel>
                <CardFace
                  card={c}
                  labels={allLabels.data ?? NO_LABELS}
                  boardMembers={board?.members ?? NO_MEMBERS}
                />
                <Hint>
                  in {board?.name ?? 'a board'}
                  {c.archived ? ' · archived' : ''}
                </Hint>
              </Panel>
            </Pressable>
          );
        })}
      </CardGrid>
    </Screen>
  );
}

/**
 * How many results are drawn. Everything you can see is already in memory, so
 * this bounds the RENDER, not the fetch — and the count below it says how many
 * were left out, because a list that silently stops is a list you cannot trust.
 */
const RESULT_CAP = 200;

const styles = StyleSheet.create({
  chips: { flexWrap: 'wrap', gap: space.xs },
  searchBar: { maxWidth: 520, gap: space.sm },
});
