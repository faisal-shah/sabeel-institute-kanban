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
  Card as Panel,
  Heading,
  Row,
  Screen,
  Spinner,
  TextField,
  Title,
} from '../components/ui';
import { radius, useTheme } from '../theme';

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

  // Load card metadata for the user's boards once, then filter in memory as
  // they type — refetching per keystroke would be pointless traffic.
  useEffect(() => {
    let cancelled = false;
    const ids = boardIds ? boardIds.split(',') : [];
    if (ids.length === 0) {
      setCards([]);
      return;
    }

    setLoading(true);
    Promise.all(
      ids.map((boardId) =>
        getDocs(query(collection(db, 'cards'), where('boardId', '==', boardId))).then((snap) =>
          snap.docs.map<SearchableCard>((d) => ({
            id: d.id,
            boardId,
            title: (d.data().title as string) ?? '',
            description: (d.data().description as string) ?? '',
            columnId: (d.data().columnId as string) ?? '',
            assigneeUids: (d.data().assigneeUids as string[]) ?? [],
            labelIds: (d.data().labelIds as string[]) ?? [],
            priority: d.data().priority ?? 'none',
            dueDate: d.data().dueDate as string | undefined,
            archived: Boolean(d.data().archived),
          })),
        ),
      ),
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
  }, [boardIds]);

  const results = useMemo(() => {
    if (!cards || text.trim().length === 0) return [];
    const today = todayInOrgTz();
    return rankMatches(filterCards(cards, { text, includeArchived }, today), text).slice(
      0,
      50,
    );
  }, [cards, text, includeArchived]);

  return (
    <Screen>
      <Row style={styles.between}>
        <Title>Search</Title>
        <Button label="Back" variant="secondary" onPress={nav.pop} />
      </Row>

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

      {error ? (
        <Panel>
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
    </Screen>
  );
}

const styles = StyleSheet.create({
  between: { justifyContent: 'space-between' },
  dot: { width: 10, height: 10, borderRadius: radius.pill },
});
