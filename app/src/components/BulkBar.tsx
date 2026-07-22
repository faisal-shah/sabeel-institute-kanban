import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { BoardColumn } from '@sabeel/shared';
import {
  bulkArchive,
  bulkAssign,
  bulkCopyToBoard,
  bulkDelete,
  bulkMove,
  bulkMoveToBoard,
  cardsInColumn,
  type Card,
} from '../cards';
import { Select } from './Select';
import type { Selection } from '../useSelection';
import { sessionCan, type SessionUser } from '../session';
import { useMyBoards, type BoardMemberProfile } from '../boards';
import { Body, Button, Caption, Hint, IconAction, Row } from './ui';
import { radius, space, useTheme } from '../theme';
import { toUserMessage } from '../errors';

/**
 * Actions for a multi-card selection. Shared by both board layouts so the two
 * surfaces offer exactly the same operations with the same guard rails.
 *
 * Destructive actions ask; archive does not, because archive is reversible from
 * the archive view and confirming a reversible action just trains people to
 * dismiss dialogs.
 */
export function BulkBar({
  currentBoardId,
  columns,
  allCards,
  selection,
  members,
  user,
  onError,
}: {
  currentBoardId: string;
  columns: readonly BoardColumn[];
  allCards: readonly Card[];
  selection: Selection;
  members: readonly BoardMemberProfile[];
  user: SessionUser;
  onError: (message: string) => void;
}) {
  const t = useTheme();
  const [mode, setMode] = useState<
    'idle' | 'move' | 'assign' | 'confirmDelete' | 'moveToBoard'
  >('idle');
  const [busy, setBusy] = useState(false);
  const [destBoardId, setDestBoardId] = useState('');
  const [destColumnId, setDestColumnId] = useState('');
  // The boards you could move/copy to (members see their own; managers see all).
  const boards = useMyBoards(user);

  if (!selection.active) return null;

  const chosen = selection.selected;
  const otherBoards = (boards.data ?? []).filter((b) => b.id !== currentBoardId);
  const dest = otherBoards.find((b) => b.id === destBoardId);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    try {
      await fn();
      selection.clear();
      setMode('idle');
    } catch (e) {
      onError(toUserMessage(e, 'bulkBar'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View
      style={[
        styles.bar,
        { backgroundColor: t.bg.raised, borderColor: t.border.strong },
      ]}
    >
      {/* ONE row. This bar floats over the board, so every row it takes is a row
          of board you cannot see. Labelled buttons wrapped onto two or three
          rows on a phone; move, assign, archive, delete and close are ordinary
          operations with settled icons, and each keeps its word as an
          accessibility label. */}
      <Row style={styles.between}>
        <Caption>{selection.count} selected</Caption>
        <Row style={styles.actions}>
          {mode === 'idle' ? (
            <>
              <IconAction
                icon="swap-horiz"
                label="Move selected cards"
                onPress={() => setMode('move')}
              />
              <IconAction
                icon="drive-file-move"
                label="Copy or move to another board"
                onPress={() => {
                  setDestBoardId('');
                  setDestColumnId('');
                  setMode('moveToBoard');
                }}
              />
              <IconAction
                icon="person-add"
                label="Assign selected cards"
                onPress={() => setMode('assign')}
              />
              <IconAction
                icon="archive"
                label="Archive selected cards"
                onPress={() => run(() => bulkArchive(chosen, user))}
              />
              {/* Members archive; only managers and admins destroy. */}
              {sessionCan.manageBoards(user) ? (
                <IconAction
                  icon="delete-outline"
                  label="Delete selected cards"
                  danger
                  onPress={() => setMode('confirmDelete')}
                />
              ) : null}
            </>
          ) : null}
          <IconAction
            icon="close"
            label={mode === 'idle' ? 'Clear selection' : 'Cancel'}
            onPress={() => (mode === 'idle' ? selection.clear() : setMode('idle'))}
          />
        </Row>
      </Row>

      {mode === 'move' ? (
        <>
          <Caption>Move the selection to</Caption>
          <Row style={styles.wrap}>
            {/* A dropdown rather than one button per column: the bar sits over
                the board, so it must stay small however many columns exist. */}
            <Select
              label="Destination column"
              value=""
              options={[
                { value: '', label: 'Choose a column…' },
                ...columns.map((col) => ({ value: col.id, label: col.name })),
              ]}
              disabled={busy}
              onChange={(toColumnId) => {
                if (!toColumnId) return;
                run(() =>
                  bulkMove({
                    cards: chosen,
                    toColumnId,
                    destinationCards: cardsInColumn(allCards, toColumnId),
                    user,
                  }),
                );
              }}
            />
            <Button label="Cancel" variant="secondary" onPress={() => setMode('idle')} />
          </Row>
        </>
      ) : null}

      {mode === 'moveToBoard' ? (
        <>
          <Caption>Copy or move the selection to another board</Caption>
          <Hint>
            Labels are cleared, and anyone not on the destination board is
            unassigned.
          </Hint>
          {otherBoards.length === 0 ? (
            <Hint>You are not on any other board.</Hint>
          ) : null}
          {/* One left-aligned row that reflows. The dropdowns are only as wide as
              their text (no full-width stretch — on a wide monitor that would blow
              them across the screen and push the buttons out of sight), and Copy +
              Move sit right after them. If it cannot fit, the row wraps — and the
              two buttons wrap together, never split, because they share a Row. No
              counts (the "N selected" caption says how many); the persistent ✕ in
              the top row cancels. */}
          <Row style={styles.controls}>
            <Select
              label="Destination board"
              value={destBoardId}
              options={[
                { value: '', label: 'Choose a board…' },
                ...otherBoards.map((b) => ({ value: b.id, label: b.name })),
              ]}
              disabled={busy}
              onChange={(id) => {
                setDestBoardId(id);
                setDestColumnId('');
              }}
            />
            {dest ? (
              <Select
                label="Destination column"
                value={destColumnId}
                options={[
                  { value: '', label: 'Choose a column…' },
                  ...dest.columns.map((c) => ({ value: c.id, label: c.name })),
                ]}
                disabled={busy}
                onChange={setDestColumnId}
              />
            ) : null}
            {dest && destColumnId ? (
              <Row>
                <Button
                  label="Copy"
                  variant="secondary"
                  busy={busy}
                  onPress={() =>
                    run(() =>
                      bulkCopyToBoard({
                        cards: chosen,
                        destBoardId: dest.id,
                        destColumnId,
                        destMemberUids: dest.memberUids,
                        user,
                      }),
                    )
                  }
                />
                <Button
                  label="Move"
                  variant="primary"
                  busy={busy}
                  onPress={() =>
                    run(() =>
                      bulkMoveToBoard({
                        cards: chosen,
                        destBoardId: dest.id,
                        destColumnId,
                        destMemberUids: dest.memberUids,
                        user,
                      }),
                    )
                  }
                />
              </Row>
            ) : null}
          </Row>
        </>
      ) : null}

      {mode === 'assign' ? (
        <>
          <Caption>Assign or unassign across the selection</Caption>
          {members.length === 0 ? (
            <Hint>No board members available.</Hint>
          ) : null}
          {members.map((m) => {
            const allHave = chosen.every((c) => c.assigneeUids.includes(m.uid));
            return (
              <Row key={m.uid} style={styles.between}>
                <Body>{m.displayName}</Body>
                <Button
                  label={allHave ? 'Unassign' : 'Assign'}
                  variant={allHave ? 'secondary' : 'primary'}
                  busy={busy}
                  onPress={() =>
                    run(() =>
                      bulkAssign({
                        cards: chosen,
                        uid: m.uid,
                        assign: !allHave,
                        user,
                      }),
                    )
                  }
                />
              </Row>
            );
          })}
          <Button label="Cancel" variant="secondary" onPress={() => setMode('idle')} />
        </>
      ) : null}

      {mode === 'confirmDelete' ? (
        <>
          <Body>
            Permanently delete {selection.count} card
            {selection.count === 1 ? '' : 's'}? This cannot be undone — archiving
            keeps them recoverable.
          </Body>
          <Row style={styles.wrap}>
            <Button
              label={`Delete ${selection.count}`}
              variant="danger"
              busy={busy}
              onPress={() => run(() => bulkDelete(chosen))}
            />
            <Button label="Cancel" variant="secondary" onPress={() => setMode('idle')} />
          </Row>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    padding: space.md,
    gap: space.sm,
    marginBottom: space.sm,
  },
  between: { justifyContent: 'space-between', alignItems: 'center' },
  actions: { gap: space.lg, alignItems: 'center' },
  wrap: { flexWrap: 'wrap' },
  // Board · column · [Copy Move] on one left-aligned row that wraps as needed.
  controls: { flexWrap: 'wrap' },
});
