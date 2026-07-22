import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import {
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
  const [pendingRemoval, setPendingRemoval] = useState<{
    uid: string;
    cards: number;
  } | null>(null);

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

  async function askRemove(uid: string) {
    // "Remove Sara?" and "Remove Sara, unassigning 12 cards?" are different
    // questions — find out which one we are asking before asking it.
    const cards = await countMemberAssignments(boardId, uid).catch(() => 0);
    setPendingRemoval({ uid, cards });
  }

  // Current members come from the board (everyone can see them); the ADD picker
  // needs the directory, which only admins may list.
  const members = b.members;
  const nonMembers = (allUsers.data ?? []).filter(
    (u) => !b.memberUids.includes(u.uid) && u.status === 'active',
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
        {b.columns.map((c, i) => (
          <Row key={c.id} style={styles.between}>
            <Body>{c.name}</Body>
            <Row>
              <Button
          busy={busy}
                label="↑"
                variant="secondary"
                disabled={i === 0}
                onPress={() =>
                  run(() => {
                    const next = [...b.columns];
                    [next[i - 1], next[i]] = [next[i], next[i - 1]];
                    return updateBoard(boardId, columnsPatch(next));
                  })
                }
              />
              <Button
          busy={busy}
                label="↓"
                variant="secondary"
                disabled={i === b.columns.length - 1}
                onPress={() =>
                  run(() => {
                    const next = [...b.columns];
                    [next[i + 1], next[i]] = [next[i], next[i + 1]];
                    return updateBoard(boardId, columnsPatch(next));
                  })
                }
              />
            </Row>
          </Row>
        ))}
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
      <Card>
        {members.map((m) => (
          <Row key={m.uid} style={styles.between}>
            <View style={styles.grow}>
              <Body>{m.displayName}</Body>
              <Hint>{m.email}</Hint>
            </View>
            <Row>
              {/* The board knows who its members are, not what org role they
                  hold — that lives in users/*, which only admins may read. */}
              {m.uid === user.uid ? null : (
                <Button
                  label="Remove"
                  variant="secondary"
                  onPress={() => askRemove(m.uid)}
                />
              )}
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

      {pendingRemoval ? (
        <Card>
          <Body>
            Remove this person from the board?
            {pendingRemoval.cards > 0
              ? ` They are assigned to ${pendingRemoval.cards} card${
                  pendingRemoval.cards === 1 ? '' : 's'
                }, and will be unassigned from ${
                  pendingRemoval.cards === 1 ? 'it' : 'them'
                }.`
              : ' They are not assigned to any cards.'}
          </Body>
          <Row>
            <Button
          busy={busy}
              label="Remove"
              variant="danger"
              onPress={() =>
                run(async () => {
                  await removeBoardMember(boardId, pendingRemoval.uid);
                  setPendingRemoval(null);
                })
              }
            />
            <Button
              label="Cancel"
              variant="secondary"
              onPress={() => setPendingRemoval(null)}
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
      <TextField value={name} onChangeText={setName} placeholder="Board name" />
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
