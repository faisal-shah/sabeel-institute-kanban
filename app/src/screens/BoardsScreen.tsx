import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextInput } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { BOARD_NAME_MAX, sortBoardsForList } from '@sabeel/shared';
import {
  createBoard,
  noteBoardOpened,
  toggleFavourite,
  useMyBoardPrefs,
  useMyBoards,
  type BoardListItem,
} from '../boards';
import { sessionCan, type SessionUser } from '../session';
import { useArchivedBoards } from '../boards';
import { useNav } from '../nav';
import {
  Body,
  Button,
  Caption,
  Card,
  CardGrid,
  Heading,
  LoadError,
  Row,
  Screen,
  Spinner,
  Title,
} from '../components/ui';
import { radius, space, type, useTheme } from '../theme';

/** Shared empty array, so absent preferences keep a stable identity. */
const EMPTY: string[] = [];

function BoardRow({
  board,
  isFavourite,
  onOpen,
  onToggleFavourite,
}: {
  board: BoardListItem;
  isFavourite: boolean;
  onOpen: () => void;
  onToggleFavourite: () => void;
}) {
  const t = useTheme();
  return (
    <Card>
      <Row style={styles.between}>
        <Pressable onPress={onOpen} style={styles.grow} accessibilityRole="button">
          <Body>{board.name}</Body>
          <Caption>
            {board.activeCardCount} card{board.activeCardCount === 1 ? '' : 's'} ·{' '}
            {board.memberUids.length} member{board.memberUids.length === 1 ? '' : 's'}
          </Caption>
        </Pressable>
        <Pressable
          onPress={onToggleFavourite}
          accessibilityRole="button"
          accessibilityLabel={isFavourite ? `Unstar ${board.name}` : `Star ${board.name}`}
          hitSlop={10}
        >
          <MaterialIcons
            name={isFavourite ? 'star' : 'star-border'}
            size={24}
            color={isFavourite ? t.accent.base : t.text.muted}
          />
        </Pressable>
      </Row>
    </Card>
  );
}

export function BoardsScreen({ user }: { user: SessionUser }) {
  const nav = useNav();
  const boards = useMyBoards(user);
  const prefs = useMyBoardPrefs(user);
  const [filter, setFilter] = useState('');
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const t = useTheme();

  // `?? []` would allocate a fresh array on every render, so the memo below
  // would never actually memoize. Constant empties keep the identity stable.
  const favourites = prefs.data?.favourites ?? EMPTY;
  const recents = prefs.data?.recents ?? EMPTY;

  const sections = useMemo(() => {
    const all = (boards.data ?? []).filter((b) =>
      b.name.toLowerCase().includes(filter.trim().toLowerCase()),
    );
    return sortBoardsForList(all, favourites, recents);
  }, [boards.data, favourites, recents, filter]);

  async function open(board: BoardListItem) {
    // Fire-and-forget: recording "recently opened" must never delay navigation.
    void noteBoardOpened(user, board.id, recents).catch(() => {});
    nav.push({ name: 'board', boardId: board.id });
  }

  async function create() {
    const name = newName.trim();
    // The `busy` guard stops a second fast tap from creating a duplicate board
    // in the window before the await resolves and the form closes.
    if (!name || busy) return;
    setBusy(true);
    setError(null);
    try {
      const id = await createBoard(name, user);
      setNewName('');
      setCreating(false);
      nav.push({ name: 'board', boardId: id });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (boards.status === 'loading') return <Spinner label="Loading boards…" />;
  // Before this, a failed query fell through to the empty state and told a
  // member with fifteen boards that they had none.
  if (boards.status === 'error') {
    return (
      <Screen width="list">
        <Title>Boards</Title>
        <LoadError what="your boards" />
      </Screen>
    );
  }

  const hasAny =
    sections.favourites.length + sections.recents.length + sections.others.length > 0;

  return (
    <Screen width="list">
      {/* Section actions (Search, My work, Alerts, People, Sign out) live in the
          app-wide nav bar now — bottom bar on a phone, left rail on wide. This
          screen keeps only its own title and the create-board control. */}
      <Title>Boards</Title>

      {sessionCan.manageBoards(user) ? (
        creating ? (
          <Card style={styles.form}>
            <Caption>New board</Caption>
            <TextInput
              value={newName}
              onChangeText={setNewName}
              placeholder="Board name"
              placeholderTextColor={t.text.muted}
              autoFocus
              maxLength={BOARD_NAME_MAX}
              onSubmitEditing={create}
              style={[
                styles.input,
                {
                  backgroundColor: t.bg.inset,
                  color: t.text.primary,
                  borderColor: t.border.subtle,
                },
              ]}
            />
            <Row>
              <Button
                label="Create"
                onPress={create}
                busy={busy}
                disabled={!newName.trim() || busy}
              />
              <Button
                label="Cancel"
                variant="secondary"
                onPress={() => {
                  setCreating(false);
                  setNewName('');
                }}
              />
            </Row>
          </Card>
        ) : (
          <Button label="New board" onPress={() => setCreating(true)} />
        )
      ) : null}

      {error ? (
        <Card style={styles.form}>
          <Body>{error}</Body>
        </Card>
      ) : null}

      {(boards.data?.length ?? 0) > 6 ? (
        <TextInput
          value={filter}
          onChangeText={setFilter}
          placeholder="Filter boards"
          placeholderTextColor={t.text.muted}
          style={[
            styles.input,
            styles.form,
            {
              backgroundColor: t.bg.inset,
              color: t.text.primary,
              borderColor: t.border.subtle,
            },
          ]}
        />
      ) : null}

      {!hasAny ? (
        <Card style={styles.form}>
          <Body muted>
            {sessionCan.manageBoards(user)
              ? 'No boards yet. Create one to get started.'
              : 'You are not on any boards yet. A manager can add you to one.'}
          </Body>
        </Card>
      ) : null}

      {sections.favourites.length > 0 ? (
        <>
          <Heading>Starred</Heading>
          <CardGrid>
            {sections.favourites.map((b) => (
              <BoardRow
                key={b.id}
                board={b}
                isFavourite
                onOpen={() => open(b)}
                onToggleFavourite={() => toggleFavourite(user, b.id, favourites)}
              />
            ))}
          </CardGrid>
        </>
      ) : null}

      {sections.recents.length > 0 ? (
        <>
          <Heading>Recent</Heading>
          <CardGrid>
            {sections.recents.map((b) => (
              <BoardRow
                key={b.id}
                board={b}
                isFavourite={false}
                onOpen={() => open(b)}
                onToggleFavourite={() => toggleFavourite(user, b.id, favourites)}
              />
            ))}
          </CardGrid>
        </>
      ) : null}

      {sections.others.length > 0 ? (
        <>
          <Heading>
            {sections.favourites.length + sections.recents.length > 0
              ? 'All boards'
              : 'Boards'}
          </Heading>
          <CardGrid>
            {sections.others.map((b) => (
              <BoardRow
                key={b.id}
                board={b}
                isFavourite={false}
                onOpen={() => open(b)}
                onToggleFavourite={() => toggleFavourite(user, b.id, favourites)}
              />
            ))}
          </CardGrid>
        </>
      ) : null}

      {/* Archived boards live behind a disclosure, not mixed into the list.
          Archiving is meant to be the SAFE alternative to deleting, but the
          board list filters archived boards out and "Restore" lives inside
          board settings — which you can only reach from the board. So an
          archived board was unreachable, and archive was a one-way door.

          Collapsed by default: the point of archiving is to get a board out of
          the way, and a flat list of active and archived boards together would
          undo that. */}
      {sessionCan.manageBoards(user) ? (
        <ArchivedBoards user={user} onOpen={open} />
      ) : null}
    </Screen>
  );
}

function ArchivedBoards({
  user,
  onOpen,
}: {
  user: SessionUser;
  onOpen: (b: BoardListItem) => void;
}) {
  const archived = useArchivedBoards(user);
  const [open, setOpen] = useState(false);
  const list = archived.data ?? [];

  // Nothing archived: say nothing at all rather than showing an empty section.
  if (list.length === 0) return null;

  return (
    <>
      <Button
        label={open ? `Hide archived (${list.length})` : `Archived (${list.length})`}
        variant="secondary"
        onPress={() => setOpen((v) => !v)}
      />
      {open ? (
        <>
          <Caption>
            Archived boards are hidden from everyone. Open one and use Restore in
            its settings to bring it back.
          </Caption>
          <CardGrid>
            {list.map((b) => (
              <BoardRow
                key={b.id}
                board={b}
                isFavourite={false}
                onOpen={() => onOpen(b)}
                onToggleFavourite={() => {}}
              />
            ))}
          </CardGrid>
        </>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  between: { justifyContent: 'space-between' },
  /** Wraps so no action can be pushed off a narrow screen. */
  grow: { flex: 1, gap: space.xs },
  /** Forms and messages stay a readable width inside the wide board grid. */
  form: { maxWidth: 520 },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.sm,
    padding: space.md,
    minHeight: 44,
    ...type.body,
  },
});
