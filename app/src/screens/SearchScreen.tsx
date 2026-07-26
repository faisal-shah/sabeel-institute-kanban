import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { collection, getDocs, query, where } from 'firebase/firestore';
import {
  filterCards,
  rankMatches,
  type Priority,
  todayInOrgTz,
  type BoardLabel,
  type SearchableCard,
} from '@sabeel/shared';
import { db } from '../firebase';
import { useMyBoards, type BoardListItem, type BoardMemberProfile } from '../boards';
import type { SessionUser } from '../session';
import { useNav } from '../nav';
import {
  Body,
  Caption,
  CardGrid,
  FilterChip,
  Card as Panel,
  Heading,
  Row,
  Screen,
  Spinner,
  TextField,
  Title,
} from '../components/ui';
import { CardFace } from '../components/CardFace';
import { space } from '../theme';

const NO_LABELS: BoardLabel[] = [];
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
  const boards = useMyBoards(user);

  const [text, setText] = useState('');
  const [archivedOnly, setArchivedOnly] = useState(false);
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [priority, setPriority] = useState<Priority | undefined>(undefined);
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
      { text, archivedOnly, priority, due: overdueOnly ? 'overdue' : undefined },
      today,
    );
    // With a query, rank by relevance. Without one, the useful order is what
    // changed most recently — "what has been happening across my boards".
    const ordered = text.trim()
      ? rankMatches(matched, text)
      : [...matched].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
    return { results: ordered.slice(0, RESULT_CAP), total: ordered.length };
  }, [cards, text, archivedOnly, priority, overdueOnly]);

  return (
    <Screen width="list">
      {/* No Back button: Search is a tab root reached from the nav bar. */}
      <Title>Search</Title>

      {/* The search box and its toggle are a form: keep them a comfortable width
          rather than stretched across the results grid. */}
      <View style={styles.searchBar}>
        <TextField
          value={text}
          onChangeText={setText}
          placeholder="Search cards across your boards"
          autoFocus
        />
        {/* Filter chips. Each maps to a filter that already exists and is
            already tested in @sabeel/shared — this surfaces them rather than
            inventing a parallel mechanism. Kept to the few that answer a
            question no other screen answers: "Assigned to me" would duplicate My
            Work, and a full label/assignee matrix would rebuild the board
            filters that were deliberately parked. */}
        <Row style={styles.chips}>
          <FilterChip
            label="Archived"
            active={archivedOnly}
            onPress={() => setArchivedOnly((v) => !v)}
          />
          <FilterChip
            label="Overdue"
            active={overdueOnly}
            onPress={() => setOverdueOnly((v) => !v)}
          />
          {(['urgent', 'high'] as const).map((p) => (
            <FilterChip
              key={p}
              label={p === 'urgent' ? 'Urgent' : 'High'}
              active={priority === p}
              onPress={() => setPriority((cur) => (cur === p ? undefined : p))}
            />
          ))}
        </Row>
      </View>

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
            <Caption>
              Showing the first {RESULT_CAP}. Narrow it with a filter or a search
              term.
            </Caption>
          ) : null}
        </>
      ) : null}

      <CardGrid>
        {results.map((c) => {
          const board = boardById.get(c.boardId);
          return (
            <Pressable
              key={`${c.boardId}/${c.id}`}
              accessibilityRole="button"
              accessibilityLabel={c.title}
              onPress={() => nav.push({ name: 'card', boardId: c.boardId, cardId: c.id })}
            >
              <Panel>
                <CardFace
                  card={c}
                  boardLabels={board?.labels ?? NO_LABELS}
                  boardMembers={board?.members ?? NO_MEMBERS}
                />
                <Caption>
                  in {board?.name ?? 'a board'}
                  {c.archived ? ' · archived' : ''}
                </Caption>
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
