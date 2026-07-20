import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { BoardColumn } from '@sabeel/shared';
import {
  bulkArchive,
  bulkAssign,
  bulkDelete,
  bulkMove,
  cardsInColumn,
  type Card,
} from '../cards';
import { Select } from './Select';
import type { Selection } from '../useSelection';
import { sessionCan, type SessionUser } from '../session';
import type { BoardMemberProfile } from '../boards';
import { Body, Button, Caption, IconAction, Row } from './ui';
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
  boardId,
  columns,
  allCards,
  selection,
  members,
  user,
  onError,
}: {
  boardId: string;
  columns: readonly BoardColumn[];
  allCards: readonly Card[];
  selection: Selection;
  members: readonly BoardMemberProfile[];
  user: SessionUser;
  onError: (message: string) => void;
}) {
  const t = useTheme();
  const [mode, setMode] = useState<'idle' | 'move' | 'assign' | 'confirmDelete'>(
    'idle',
  );
  const [busy, setBusy] = useState(false);

  if (!selection.active) return null;

  const chosen = selection.selected;

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
                icon="person-add"
                label="Assign selected cards"
                onPress={() => setMode('assign')}
              />
              <IconAction
                icon="archive"
                label="Archive selected cards"
                onPress={() => run(() => bulkArchive(boardId, chosen, user))}
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
                    boardId,
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

      {mode === 'assign' ? (
        <>
          <Caption>Assign or unassign across the selection</Caption>
          {members.length === 0 ? (
            <Caption>No board members available.</Caption>
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
                        boardId,
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
              onPress={() => run(() => bulkDelete(boardId, chosen))}
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
});
