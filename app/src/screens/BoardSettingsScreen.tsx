import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import {
  BOARD_NAME_MAX,
  LABEL_COLORS,
  LABEL_NAME_MAX,
  columnsPatch,
  describeLabelUsage,
  localId,
  validateBoardName,
  validateColumnName,
  validateLabelName,
  type BoardColumn,
  type Label,
} from '@sabeel/shared';
import {
  addBoardMember,
  countMemberAssignments,
  removeBoardMember,
  updateBoard,
  useBoard,
} from '../boards';
import {
  countLabelUsage,
  createLabel,
  deleteLabel,
  updateLabel,
  useLabels,
  type LabelUsage,
} from '../labels';
import { useAllUsers } from '../users';
import type { SessionUser } from '../session';
import { useNav } from '../nav';
import {
  Body,
  Button,
  Hint,
  Card,
  Heading,
  IconAction,
  Row,
  Screen,
  Spinner,
  TextField,
  Title,
} from '../components/ui';
import { ColumnNameEditor } from '../components/ColumnNameEditor';
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
  // Labels are org-wide. This section edits ONE set that every board shows —
  // the copy below says so, because the screen it sits on does not.
  const labels = useLabels();
  /**
   * The label list, but ONLY once we actually have it.
   *
   * `useLiveQuery` reports `data: undefined` while loading AND on error, so the
   * `?? []` this used to carry turned "not known yet" into "there are no
   * labels" — and `validateLabelName` against an empty set waves every
   * duplicate through. The result is a persistent org-wide label that only a
   * manager can remove, created with no warning at all. Null here means the
   * create controls stay disabled until the check can mean something.
   */
  const knownLabels = labels.status === 'ready' ? labels.data : null;
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
  /** The label awaiting a delete confirmation, and how many cards carry it
   *  (null = still counting, exactly like the member removal above). */
  const [pendingLabel, setPendingLabel] = useState<Label | null>(null);
  const [pendingLabelCards, setPendingLabelCards] = useState<LabelUsage | null>(null);
  /** Which label is being renamed inline, and the text so far. */
  const [renamingLabel, setRenamingLabel] = useState<string | null>(null);
  const [labelDraft, setLabelDraft] = useState('');
  const labelCountReq = useRef(0);
  /** Whether the "add someone" picker is open — its trigger is on the heading. */
  const [adding, setAdding] = useState(false);
  const countReq = useRef(0);

  // Who the ADD picker can offer. Derived up here, ABOVE the early returns
  // below, because the effect that closes the picker is a hook and hooks cannot
  // sit after a conditional return.
  //
  // Current members come from the board (everyone can see them); this list needs
  // the directory, which only admins may list.
  const nonMembers = useMemo(() => {
    const bd = board.data;
    if (!bd) return [];
    return (allUsers.data ?? []).filter(
      (u) =>
        !bd.memberUids.includes(u.uid) &&
        u.status === 'active' &&
        // You add yourself with Join, not from the add-someone list.
        u.uid !== user.uid,
    );
  }, [board.data, allUsers.data, user.uid]);

  // Adding the LAST candidate empties the picker while it is still open, which
  // would otherwise render an empty panel directly above the "nobody available
  // to add" hint, with the heading's trigger hidden because `adding` is true.
  useEffect(() => {
    if (adding && nonMembers.length === 0) setAdding(false);
  }, [adding, nonMembers.length]);

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

  async function addLabel() {
    if (knownLabels === null) return;
    const problem = validateLabelName(newLabelName, knownLabels);
    if (problem) {
      setError(problem);
      return;
    }
    await run(async () => {
      await createLabel({ name: newLabelName, color: labelColor, user });
      setNewLabelName('');
    });
  }

  async function saveLabelName(label: Label) {
    // Exclude the label being renamed, or "no change" fails its own uniqueness
    // check — the same self-exclusion renameColumn needs.
    if (knownLabels === null) return;
    const problem = validateLabelName(labelDraft, knownLabels, label.id);
    if (problem) {
      setError(problem);
      return;
    }
    await run(async () => {
      await updateLabel(label.id, { name: labelDraft });
      setRenamingLabel(null);
    });
  }

  /**
   * Deleting a label takes it off every card on every board, so it asks first
   * and says how many. Same shape as removing a member: open the dialog at once
   * — the dialog IS the feedback — and drop the count in when the callable
   * returns, ignoring a stale answer if the dialog has moved on.
   */
  function askDeleteLabel(label: Label) {
    setPendingLabel(label);
    setPendingLabelCards(null);
    const req = ++labelCountReq.current;
    countLabelUsage(label.id)
      .then((n) => {
        if (labelCountReq.current === req) setPendingLabelCards(n);
      })
      .catch(() => {
        if (labelCountReq.current === req) setPendingLabelCards({ active: 0, archived: 0 });
      });
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

  // Current members come from the board — everyone can see them. (The ADD
  // picker's candidates are derived above, where the hooks live.)
  const members = b.members;
  // You reach this screen only as a manager/admin, and may be viewing a board
  // you have not joined. Join/Leave touch only your OWN uid, so they need no
  // directory read — a manager can join any board without admin rights to list
  // users, and anyone can step out of a board they no longer work.
  const isMember = b.memberUids.includes(user.uid);

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
        {/* The name is editable in place. Dragging is the handle's job, so a tap
            on the pencil cannot start a reorder. */}
        <ReorderList
          items={b.columns}
          keyOf={(c) => c.id}
          renderItem={(c) => (
            <ColumnNameEditor
              column={c}
              columns={b.columns}
              canEdit
              busy={busy}
              onError={setError}
              onRename={(next) => run(() => updateBoard(boardId, columnsPatch(next)))}
            />
          )}
          onReorder={(next) => run(() => updateBoard(boardId, columnsPatch(next)))}
        />
        <Hint>
          Columns are removed from the board screen, and only once they are
          empty — so no cards can vanish with them.
        </Hint>
        <Row style={styles.addRow}>
          <View style={styles.grow}>
            <TextField
              value={newColumn}
              onChangeText={setNewColumn}
              placeholder="New column name"
              onSubmit={addColumn}
            />
          </View>
          <IconAction
            icon="add"
            label="Add column"
            accent
            size={24}
            onPress={addColumn}
            disabled={busy || !newColumn.trim()}
          />
        </Row>
      </Card>

      <Heading>Labels</Heading>
      <Card>
        {/* This screen is per-board and these labels are not, which is exactly
            the misreading to head off: someone deletes one expecting it to
            affect their board alone. */}
        <Hint>
          Labels are shared by every board. Adding, renaming or deleting one
          changes it everywhere.
        </Hint>
        {labels.status === 'loading' ? <Spinner label="Loading labels…" /> : null}
        {(labels.data ?? []).length === 0 && labels.status === 'ready' ? (
          <Hint>No labels yet.</Hint>
        ) : null}
        {(labels.data ?? []).map((l) =>
          renamingLabel === l.id ? (
            <Row key={l.id} style={styles.between}>
              <View style={[styles.swatch, { backgroundColor: l.color }]} />
              <View style={styles.grow}>
                <TextField
                  value={labelDraft}
                  onChangeText={setLabelDraft}
                  label={`New name for ${l.name}`}
                  maxLength={LABEL_NAME_MAX}
                  autoFocus
                />
              </View>
              <IconAction
                icon="check"
                label={`Save name for ${l.name}`}
                accent
                disabled={busy || !labelDraft.trim() || knownLabels === null}
                onPress={() => saveLabelName(l)}
              />
              <IconAction
                icon="close"
                label="Cancel rename"
                disabled={busy}
                onPress={() => setRenamingLabel(null)}
              />
            </Row>
          ) : (
            <Row key={l.id} style={styles.between}>
              <Row>
                <View style={[styles.swatch, { backgroundColor: l.color }]} />
                <Body>{l.name}</Body>
              </Row>
              <Row>
                {/* Recolouring in place: the swatch row below belongs to the
                    NEW label being composed, so an existing one needs its own
                    way to change, and cycling the palette is one tap rather
                    than a second editor. */}
                <IconAction
                  icon="palette"
                  label={`Change colour of ${l.name}`}
                  disabled={busy}
                  onPress={() =>
                    run(() =>
                      updateLabel(l.id, {
                        color:
                          LABEL_COLORS[
                            (LABEL_COLORS.indexOf(
                              l.color as (typeof LABEL_COLORS)[number],
                            ) +
                              1) %
                              LABEL_COLORS.length
                          ],
                      }),
                    )
                  }
                />
                <IconAction
                  icon="edit"
                  label={`Rename ${l.name}`}
                  disabled={busy}
                  onPress={() => {
                    setRenamingLabel(l.id);
                    setLabelDraft(l.name);
                  }}
                />
                <IconAction
                  icon="delete-outline"
                  label={`Delete label ${l.name}`}
                  danger
                  disabled={busy}
                  onPress={() => askDeleteLabel(l)}
                />
              </Row>
            </Row>
          ),
        )}
        <TextField
          value={newLabelName}
          onChangeText={setNewLabelName}
          placeholder="New label name"
          maxLength={LABEL_NAME_MAX}
        />
        {/* The + sits at the END of the colour row, where the flow finishes:
            name it, colour it, add it. */}
        <Row style={styles.addRow}>
          <Row style={[styles.wrap, styles.grow]}>
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
          <IconAction
            icon="add"
            label="Add label"
            accent
            size={24}
            disabled={busy || !newLabelName.trim() || knownLabels === null}
            onPress={addLabel}
          />
        </Row>
      </Card>
      {/* HERE, not with the other confirmations further down the screen. The
          bin that opens this sits in the Labels card directly above; rendered
          below Members it was off-screen on a phone, so tapping delete looked
          like it had done nothing at all. */}
      {pendingLabel ? (
        <Card>
          <Body>
            {pendingLabelCards === null
              ? `Delete “${pendingLabel.name}”? Checking how many cards use it…`
              : `Delete “${pendingLabel.name}”? ${describeLabelUsage(pendingLabelCards)}${
                  pendingLabelCards.active + pendingLabelCards.archived > 0
                    ? ' It will be removed from all of them, across every board. This cannot be undone.'
                    : ''
                }`}
          </Body>
          <Row>
            <Button
              busy={busy}
              label="Delete"
              variant="danger"
              onPress={() =>
                run(async () => {
                  await deleteLabel(pendingLabel.id);
                  setPendingLabel(null);
                })
              }
            />
            <Button
              label="Cancel"
              variant="secondary"
              onPress={() => setPendingLabel(null)}
            />
          </Row>
        </Card>
      ) : null}


      {/* Adding rides on the heading, and the candidate list opens on demand.
          It used to be a permanent second panel with a labelled Add per person,
          which grew with the directory and pushed Archive off the screen. */}
      <Heading
        action={
          nonMembers.length > 0 && !adding ? (
            <IconAction
              icon="person-add"
              label={`Add someone (${nonMembers.length} available)`}
              accent
              size={22}
              disabled={busy}
              onPress={() => setAdding(true)}
            />
          ) : null
        }
      >
        Members ({b.memberUids.length})
      </Heading>
      {!isMember ? (
        <Card>
          <Body>
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
                  own row offers Leave (a door you walk out of); everyone else,
                  Remove. Both confirm before anything happens. */}
              <IconAction
                icon={m.uid === user.uid ? 'logout' : 'person-remove'}
                label={
                  m.uid === user.uid
                    ? 'Leave this board'
                    : `Remove ${m.displayName} from this board`
                }
                disabled={busy}
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
        ) : nonMembers.length === 0 ? (
          /* Said out loud, not left silent: with no add control and no reason
             given, "why can I only assign myself?" reads as a bug rather than
             as an account still waiting for approval. */
          <Hint>
            Nobody available to add. People must be approved under People before
            they can join a board.
          </Hint>
        ) : null}

        {adding ? (
          <View
            style={[
              styles.picker,
              { borderColor: t.border.subtle, backgroundColor: t.bg.inset },
            ]}
          >
            <Hint>Add someone</Hint>
            {/* Capped and scrollable: this section must not grow with the
                directory. Same shape as the assignee and subtask pickers. */}
            <ScrollView style={styles.pickerList} nestedScrollEnabled>
              {nonMembers.map((u) => (
                <Pressable
                  key={u.uid}
                  accessibilityRole="button"
                  accessibilityLabel={`Add ${u.displayName} to this board`}
                  disabled={busy}
                  onPress={() =>
                    run(() =>
                      addBoardMember(boardId, {
                        uid: u.uid,
                        displayName: u.displayName,
                        email: u.email,
                      }),
                    )
                  }
                  style={({ pressed }) => [
                    styles.option,
                    {
                      backgroundColor: pressed ? t.bg.accentSoft : t.bg.surface,
                      borderColor: t.border.subtle,
                    },
                  ]}
                >
                  <Body>{u.displayName}</Body>
                  <Hint>{u.email}</Hint>
                </Pressable>
              ))}
            </ScrollView>
            <Button
              label="Done"
              variant="secondary"
              onPress={() => setAdding(false)}
            />
          </View>
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

      <Heading>Archive</Heading>
      <Card>
        <Body>
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
  /** A tight gap: IconAction is a laid-out 44pt box, not slop. */
  addRow: { alignItems: 'center', gap: space.xs },
  picker: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    padding: space.sm,
    gap: space.sm,
  },
  /** Roughly four rows, then it scrolls. */
  pickerList: { maxHeight: 220 },
  option: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.sm,
    padding: space.md,
    marginBottom: space.xs,
    gap: space.xs,
  },
  swatch: { width: 18, height: 18, borderRadius: radius.pill },
  swatchPick: { width: 28, height: 28, borderWidth: 2 },
});
