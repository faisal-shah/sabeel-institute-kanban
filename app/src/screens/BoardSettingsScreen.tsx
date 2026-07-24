import { useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import {
  BOARD_NAME_MAX,
  LABEL_COLORS,
  columnsPatch,
  localId,
  newLabel,
  validateBoardName,
  validateColumnName,
  type BoardColumn,
} from '@sabeel/shared';
import {
  addBoardMember,
  countMemberAssignments,
  removeBoardMember,
  updateBoard,
  useBoard,
} from '../boards';
import { useAllUsers } from '../users';
import type { SessionUser } from '../session';
import { useNav } from '../nav';
import {
  Body,
  Button,
  Caption,
  Hint,
  Card,
  Heading,
  Row,
  Screen,
  Spinner,
  TextField,
  Title,
} from '../components/ui';
import { ReorderList } from '../components/ReorderList';
import { radius, space, useTheme } from '../theme';
import { useAction } from '../useAction';

export function BoardSettingsScreen({
  boardId,
  user,
}: {
  boardId: string;
  user: SessionUser;
}) {
  const nav = useNav();
  const board = useBoard(boardId);
  // Only admins may list all users; managers add members by picking from the
  // board's own view, so a non-admin manager sees an empty picker and a note.
  const allUsers = useAllUsers();
  const t = useTheme();

  const [newColumn, setNewColumn] = useState('');
  const [newLabelName, setNewLabelName] = useState('');
  const [labelColor, setLabelColor] = useState<string>(LABEL_COLORS[0]);
  const { run, busy, error, setError } = useAction('boardSettings');
  // The pending remove/leave confirmation. `cards` is looked up in the
  // background for removing SOMEONE ELSE (null = still counting); self-leave
  // never counts, so the dialog can open instantly with no round-trip.
  const [pending, setPending] = useState<{ uid: string; self: boolean } | null>(
    null,
  );
  const [pendingCards, setPendingCards] = useState<number | null>(null);
  const countReq = useRef(0);

  if (board.status === 'loading') return <Spinner label="Loading board…" />;
  const b = board.data;
  if (!b) {
    return (
      <Screen width="read">
        <Title>Board not found</Title>
        <Button label="Back" variant="secondary" onPress={nav.pop} />
      </Screen>
    );
  }


  async function addColumn() {
    const problem = validateColumnName(newColumn, b!.columns);
    if (problem) {
      setError(problem);
      return;
    }
    const next: BoardColumn[] = [
      ...b!.columns,
      { id: localId('col'), name: newColumn.trim() },
    ];
    setNewColumn('');
    // columnsPatch, never a bare `columns` write: rules validate card writes
    // against the flat `columnIds` mirror, so a desynced pair means cards cannot
    // be created in the new column at all — with a bare PERMISSION_DENIED as the
    // only clue.
    await run(() => updateBoard(boardId, columnsPatch(next)));
  }

  async function renameBoard(name: string) {
    const problem = validateBoardName(name);
    if (problem) {
      setError(problem);
      return;
    }
    await run(() => updateBoard(boardId, { name: name.trim() }));
  }

  function ask(uid: string) {
    // Open the confirmation IMMEDIATELY — the dialog is the feedback. Waiting on
    // a callable before showing anything read as a frozen button, and on a real
    // phone the count cold-started for seconds.
    const self = uid === user.uid;
    setPending({ uid, self });
    setPendingCards(null);
    // Self-leave skips the count entirely (one round-trip, not two);
    // removeBoardMember already reports how many cards it unassigned. For
    // removing SOMEONE ELSE the count is worth showing, so fetch it in the
    // background and drop it into the already-open dialog when it lands. The
    // req token ignores a stale count if the dialog has since changed.
    if (!self) {
      const req = ++countReq.current;
      countMemberAssignments(boardId, uid)
        .then((n) => {
          if (countReq.current === req) setPendingCards(n);
        })
        .catch(() => {
          if (countReq.current === req) setPendingCards(0);
        });
    }
  }

  // Current members come from the board (everyone can see them); the ADD picker
  // needs the directory, which only admins may list.
  const members = b.members;
  // You reach this screen only as a manager/admin, and may be viewing a board
  // you have not joined. Join/Leave touch only your OWN uid, so they need no
  // directory read — a manager can join any board without admin rights to list
  // users, and anyone can step out of a board they no longer work.
  const isMember = b.memberUids.includes(user.uid);
  const nonMembers = (allUsers.data ?? []).filter(
    (u) =>
      !b.memberUids.includes(u.uid) &&
      u.status === 'active' &&
      // You add yourself with Join, not from the add-someone list.
      u.uid !== user.uid,
  );

  return (
    <Screen width="read">
      <Row style={styles.between}>
        <Title>Board settings</Title>
        <Button label="Back" variant="secondary" onPress={nav.pop} />
      </Row>

      {error ? (
        <Card>
          <Body>{error}</Body>
        </Card>
      ) : null}

      <Heading>Name</Heading>
      <Card>
        <BoardNameEditor initial={b.name} onSave={renameBoard} />
      </Card>

      <Heading>Columns</Heading>
      <Card>
        {/* Drag the handle to reorder. One document write per drop
            (columnsPatch keeps columns/columnIds in sync — never a bare
            `columns` write, or card rules reject the new column). */}
        <ReorderList
          items={b.columns}
          keyOf={(c) => c.id}
          renderItem={(c) => <Body>{c.name}</Body>}
          onReorder={(next) => run(() => updateBoard(boardId, columnsPatch(next)))}
        />
        <Hint>
          Columns are removed from the board screen, and only once they are
          empty — so no cards can vanish with them.
        </Hint>
        <TextField
          value={newColumn}
          onChangeText={setNewColumn}
          placeholder="New column name"
          onSubmit={addColumn}
        />
        <Button label="Add column" onPress={addColumn} disabled={!newColumn.trim()} />
      </Card>

      <Heading>Labels</Heading>
      <Card>
        {b.labels.length === 0 ? <Hint>No labels yet.</Hint> : null}
        {b.labels.map((l) => (
          <Row key={l.id} style={styles.between}>
            <Row>
              <View style={[styles.swatch, { backgroundColor: l.color }]} />
              <Body>{l.name}</Body>
            </Row>
            <Button
          busy={busy}
              label="Remove"
              variant="secondary"
              onPress={() =>
                run(() =>
                  updateBoard(boardId, {
                    labels: b.labels.filter((x) => x.id !== l.id),
                  }),
                )
              }
            />
          </Row>
        ))}
        <TextField
          value={newLabelName}
          onChangeText={setNewLabelName}
          placeholder="New label name"
        />
        <Row style={styles.wrap}>
          {LABEL_COLORS.map((c) => (
            <Pressable
              key={c}
              onPress={() => setLabelColor(c)}
              accessibilityRole="button"
              accessibilityLabel={`Label colour ${c}`}
            >
              <View
                style={[
                  styles.swatch,
                  styles.swatchPick,
                  {
                    backgroundColor: c,
                    borderColor: labelColor === c ? t.text.primary : 'transparent',
                  },
                ]}
              />
            </Pressable>
          ))}
        </Row>
        <Button
          busy={busy}
          label="Add label"
          disabled={!newLabelName.trim()}
          onPress={() =>
            run(async () => {
              await updateBoard(boardId, {
                labels: [...b.labels, newLabel(newLabelName, labelColor)],
              });
              setNewLabelName('');
            })
          }
        />
      </Card>

      <Heading>Members ({b.memberUids.length})</Heading>
      {!isMember ? (
        <Card>
          <Body muted>
            You are not a member of this board. Join to be assignable to its
            cards and to see it under your own boards.
          </Body>
          <Button
            busy={busy}
            label="Join this board"
            onPress={() =>
              run(() =>
                addBoardMember(boardId, {
                  uid: user.uid,
                  displayName: user.displayName,
                  email: user.email,
                }),
              )
            }
          />
        </Card>
      ) : null}
      <Card>
        {members.map((m) => (
          <Row key={m.uid} style={styles.between}>
            <View style={styles.grow}>
              <Body>{m.displayName}</Body>
              <Hint>{m.email}</Hint>
            </View>
            <Row>
              {/* The board knows who its members are, not what org role they
                  hold — that lives in users/*, which only admins may read. Your
                  own row offers Leave (self-removal); everyone else, Remove. */}
              <Button
                busy={busy}
                label={m.uid === user.uid ? 'Leave' : 'Remove'}
                variant="secondary"
                onPress={() => ask(m.uid)}
              />
            </Row>
          </Row>
        ))}
        {allUsers.status === 'error' ? (
          <Hint>
            Only admins can browse the full directory. Ask an admin to add
            people to this board.
          </Hint>
        ) : null}
      </Card>

      {pending ? (
        <Card>
          <Body>
            {pending.self
              ? 'Leave this board? Any cards assigned to you on this board will be unassigned.'
              : pendingCards === null
                ? 'Remove this person from the board? Checking how many cards they are assigned to…'
                : pendingCards > 0
                  ? `Remove this person from the board? They are assigned to ${
                      pendingCards
                    } card${
                      pendingCards === 1 ? '' : 's'
                    }, and will be unassigned from ${
                      pendingCards === 1 ? 'it' : 'them'
                    }.`
                  : 'Remove this person from the board? They are not assigned to any cards.'}
          </Body>
          <Row>
            <Button
              busy={busy}
              label={pending.self ? 'Leave' : 'Remove'}
              variant="danger"
              onPress={() =>
                run(async () => {
                  const { uid, self } = pending;
                  await removeBoardMember(boardId, uid);
                  setPending(null);
                  // After leaving, step out to the boards list. (A manager still
                  // SEES the board, but the point of leaving is to be off it.)
                  if (self) nav.reset({ name: 'boards' });
                })
              }
            />
            <Button
              label="Cancel"
              variant="secondary"
              onPress={() => setPending(null)}
            />
          </Row>
        </Card>
      ) : null}

      {/*
        Previously this section simply vanished when there was nobody to add,
        which read as a bug: the assignee list showed only you, with no clue
        that people must be APPROVED before they can be added to a board.
      */}
      {nonMembers.length === 0 ? (
        <Card>
          <Caption>Add someone</Caption>
          <Body muted>
            {allUsers.status === 'error'
              ? 'Only admins can browse the full directory. Ask an admin to add people to this board.'
              : 'Nobody available to add. People must be approved under People before they can join a board — anyone still pending will not appear here.'}
          </Body>
        </Card>
      ) : null}

      {nonMembers.length > 0 ? (
        <Card>
          <Caption>Add someone</Caption>
          {nonMembers.map((u) => (
            <Row key={u.uid} style={styles.between}>
              <View style={styles.grow}>
                <Body>{u.displayName}</Body>
                <Hint>{u.email}</Hint>
              </View>
              <Button
          busy={busy}
                label="Add"
                onPress={() =>
                  run(() =>
                    addBoardMember(boardId, {
                      uid: u.uid,
                      displayName: u.displayName,
                      email: u.email,
                    }),
                  )
                }
              />
            </Row>
          ))}
        </Card>
      ) : null}

      <Heading>Archive</Heading>
      <Card>
        <Body muted>
          Archiving hides the board from everyone&rsquo;s list. Boards are never
          permanently deleted — too much work accumulates in them.
        </Body>
        <Button
          busy={busy}
          label={b.archived ? 'Restore board' : 'Archive board'}
          variant={b.archived ? 'primary' : 'danger'}
          onPress={() =>
            run(async () => {
              await updateBoard(boardId, { archived: !b.archived });
              if (!b.archived) nav.reset({ name: 'boards' });
            })
          }
        />
      </Card>
    </Screen>
  );
}

function BoardNameEditor({
  initial,
  onSave,
}: {
  initial: string;
  onSave: (name: string) => void;
}) {
  const [name, setName] = useState(initial);
  return (
    <>
      <TextField
        value={name}
        onChangeText={setName}
        placeholder="Board name"
        maxLength={BOARD_NAME_MAX}
      />
      <Button
        label="Save name"
        onPress={() => onSave(name)}
        disabled={name.trim() === initial}
      />
    </>
  );
}

const styles = StyleSheet.create({
  between: { justifyContent: 'space-between' },
  grow: { flex: 1, gap: space.xs },
  wrap: { flexWrap: 'wrap' },
  swatch: { width: 18, height: 18, borderRadius: radius.pill },
  swatchPick: { width: 28, height: 28, borderWidth: 2 },
});
