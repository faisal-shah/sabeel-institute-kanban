import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { sortBoardsForList } from '@sabeel/shared';
import {
  createBoard,
  noteBoardOpened,
  toggleFavourite,
  useMyBoardPrefs,
  useMyBoards,
  type BoardListItem,
} from '../boards';
import { useUnreadCount } from '../notifications';
import { sessionCan, signOut, type SessionUser } from '../session';
import { useArchivedBoards } from '../boards';
import { useNav } from '../nav';
import {
  Body,
  Button,
  Caption,
  Card,
  Heading,
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
            {board.columns.length} columns · {board.memberUids.length} member
            {board.memberUids.length === 1 ? '' : 's'}
          </Caption>
        </Pressable>
        <Pressable
          onPress={onToggleFavourite}
          accessibilityRole="button"
          accessibilityLabel={isFavourite ? `Unstar ${board.name}` : `Star ${board.name}`}
          hitSlop={10}
        >
          <View
            style={[
              styles.star,
              {
                borderColor: isFavourite ? t.accent.base : t.border.strong,
                backgroundColor: isFavourite ? t.accent.base : 'transparent',
              },
            ]}
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
  const unreadDoc = useUnreadCount(user);
  const unread = unreadDoc.data ?? 0;
  const [filter, setFilter] = useState('');
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
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
    if (!name) return;
    setError(null);
    try {
      const id = await createBoard(name, user);
      setNewName('');
      setCreating(false);
      nav.push({ name: 'board', boardId: id });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  if (boards.status === 'loading') return <Spinner label="Loading boards…" />;

  const hasAny =
    sections.favourites.length + sections.recents.length + sections.others.length > 0;

  return (
    <Screen>
      {/*
        The header actions WRAP. On a phone, five buttons on one line pushed
        "Sign out" off the right edge entirely — there was no way to sign out on
        Android. Wrapping costs a line of vertical space and keeps every action
        reachable at any width.
      */}
      <Title>Boards</Title>
      <Row style={styles.actions}>
          <Button
            label="Search"
            variant="secondary"
            onPress={() => nav.push({ name: 'search' })}
          />
          <Button
            label="My work"
            variant="secondary"
            onPress={() => nav.push({ name: 'myWork' })}
          />
          <Button
            label={unread > 0 ? `Alerts (${unread > 9 ? '9+' : unread})` : 'Alerts'}
            variant={unread > 0 ? 'primary' : 'secondary'}
            onPress={() => nav.push({ name: 'notifications' })}
          />
          {sessionCan.administerUsers(user) ? (
            <Button
              label="People"
              variant="secondary"
              onPress={() => nav.push({ name: 'users' })}
            />
          ) : null}
          <Button label="Sign out" variant="secondary" onPress={signOut} />
      </Row>

      {sessionCan.manageBoards(user) ? (
        creating ? (
          <Card>
            <Caption>New board</Caption>
            <TextInput
              value={newName}
              onChangeText={setNewName}
              placeholder="Board name"
              placeholderTextColor={t.text.muted}
              autoFocus
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
              <Button label="Create" onPress={create} disabled={!newName.trim()} />
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
        <Card>
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
            {
              backgroundColor: t.bg.inset,
              color: t.text.primary,
              borderColor: t.border.subtle,
            },
          ]}
        />
      ) : null}

      {!hasAny ? (
        <Card>
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
          {sections.favourites.map((b) => (
            <BoardRow
              key={b.id}
              board={b}
              isFavourite
              onOpen={() => open(b)}
              onToggleFavourite={() => toggleFavourite(user, b.id, favourites)}
            />
          ))}
        </>
      ) : null}

      {sections.recents.length > 0 ? (
        <>
          <Heading>Recent</Heading>
          {sections.recents.map((b) => (
            <BoardRow
              key={b.id}
              board={b}
              isFavourite={false}
              onOpen={() => open(b)}
              onToggleFavourite={() => toggleFavourite(user, b.id, favourites)}
            />
          ))}
        </>
      ) : null}

      {sections.others.length > 0 ? (
        <>
          <Heading>
            {sections.favourites.length + sections.recents.length > 0
              ? 'All boards'
              : 'Boards'}
          </Heading>
          {sections.others.map((b) => (
            <BoardRow
              key={b.id}
              board={b}
              isFavourite={false}
              onOpen={() => open(b)}
              onToggleFavourite={() => toggleFavourite(user, b.id, favourites)}
            />
          ))}
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
          {list.map((b) => (
            <BoardRow
              key={b.id}
              board={b}
              isFavourite={false}
              onOpen={() => onOpen(b)}
              onToggleFavourite={() => {}}
            />
          ))}
        </>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  between: { justifyContent: 'space-between' },
  /** Wraps so no action can be pushed off a narrow screen. */
  actions: { flexWrap: 'wrap' },
  grow: { flex: 1, gap: space.xs },
  star: { width: 20, height: 20, borderRadius: radius.pill, borderWidth: 2 },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.sm,
    padding: space.md,
    minHeight: 44,
    ...type.body,
  },
});
