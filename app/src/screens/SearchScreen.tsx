import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { collection, getDocs, query, where } from 'firebase/firestore';
import {
  filterCards,
  rankMatches,
  todayInOrgTz,
  type SearchableCard,
} from '@sabeel/shared';
import { db } from '../firebase';
import { useMyBoards } from '../boards';
import type { SessionUser } from '../session';
import { useNav } from '../nav';
import {
  Body,
  Button,
  Caption,
  CardGrid,
  Card as Panel,
  Heading,
  Row,
  Screen,
  Spinner,
  TextField,
  Title,
} from '../components/ui';
import { radius, space, useTheme } from '../theme';

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
  const t = useTheme();

  const [text, setText] = useState('');
  const [includeArchived, setIncludeArchived] = useState(false);
  const [cards, setCards] = useState<SearchableCard[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const boardIds = useMemo(
    () => (boards.data ?? []).map((b) => b.id).join(','),
    [boards.data],
  );
  const boardNames = useMemo(() => {
    const m = new Map<string, string>();
    for (const b of boards.data ?? []) m.set(b.id, b.name);
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
        if (!includeArchived) filters.push(where('archived', '==', false));
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
  }, [boardIds, includeArchived]);

  const results = useMemo(() => {
    if (!cards || text.trim().length === 0) return [];
    const today = todayInOrgTz();
    return rankMatches(filterCards(cards, { text, includeArchived }, today), text).slice(
      0,
      50,
    );
  }, [cards, text, includeArchived]);

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
        <Row>
          <Button
            label={includeArchived ? 'Including archived' : 'Excluding archived'}
            variant="secondary"
            onPress={() => setIncludeArchived((v) => !v)}
          />
        </Row>
      </View>

      {error ? (
        <Panel style={styles.searchBar}>
          <Body>{error}</Body>
        </Panel>
      ) : null}

      {loading || cards === null ? <Spinner label="Loading your cards…" /> : null}

      {!loading && text.trim().length === 0 ? (
        <Caption>
          Type to search titles and descriptions across every board you are on.
          Matching is by substring — no fuzzy spelling.
        </Caption>
      ) : null}

      {!loading && text.trim().length > 0 ? (
        <Heading>
          {results.length === 0
            ? 'No matches'
            : `${results.length} match${results.length === 1 ? '' : 'es'}`}
        </Heading>
      ) : null}

      <CardGrid>
        {results.map((c) => (
          <Pressable
            key={`${c.boardId}/${c.id}`}
            accessibilityRole="button"
            accessibilityLabel={c.title}
            onPress={() => nav.push({ name: 'card', boardId: c.boardId, cardId: c.id })}
          >
            <Panel>
              <Body>{c.title}</Body>
              <Row>
                <View style={[styles.dot, { backgroundColor: t.priority[c.priority] }]} />
                <Caption>{boardNames.get(c.boardId) ?? 'a board'}</Caption>
                {c.archived ? <Caption>· archived</Caption> : null}
                {c.dueDate ? <Caption>· due {c.dueDate}</Caption> : null}
              </Row>
            </Panel>
          </Pressable>
        ))}
      </CardGrid>
    </Screen>
  );
}

const styles = StyleSheet.create({
  searchBar: { maxWidth: 520, gap: space.sm },
  dot: { width: 10, height: 10, borderRadius: radius.pill },
});
