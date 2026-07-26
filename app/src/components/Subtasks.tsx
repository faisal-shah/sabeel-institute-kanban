import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { CARD_TITLE_MAX, childrenOf, linkableUnder, type BoardColumn } from '@sabeel/shared';
import type { Card } from '../cards';
import { Body, Button, Caption, Hint, IconAction, Row, TextField } from './ui';
import { radius, space, useTheme } from './../theme';

/**
 * The subtasks of a card: links to other cards on the same board.
 *
 * The link lives on the CHILD (`parentId`), so this list is derived from the
 * board's cards rather than stored — it cannot disagree with reality. The board's
 * cards are already loaded by the card screen for its move-rank maths, so this
 * whole section costs no extra query and no index.
 *
 * Shaped after AssigneePicker: what IS linked shows as a short list, and adding
 * more hides behind a capped, scrolling picker so the section stays the same size
 * whether the board holds five cards or five hundred. Unlike that picker this one
 * needs a FILTER, because a board has far more cards than it has members and
 * scrolling to find one by eye stops working almost immediately.
 *
 * Archived subtasks simply drop out: the card list this reads excludes them, the
 * same way the board does.
 */
export function Subtasks({
  parentId,
  boardCards,
  columns,
  busy,
  onOpen,
  onCreate,
  onLink,
  onUnlink,
}: {
  parentId: string;
  /** Every live card on this board, rank-ordered. */
  boardCards: readonly Card[];
  columns: readonly BoardColumn[];
  busy?: boolean;
  onOpen: (cardId: string) => void;
  onCreate: (title: string) => void;
  onLink: (cardId: string) => void;
  onUnlink: (cardId: string) => void;
}) {
  const t = useTheme();
  const [newTitle, setNewTitle] = useState('');
  const [picking, setPicking] = useState(false);
  const [filter, setFilter] = useState('');

  const children = useMemo(() => childrenOf(boardCards, parentId), [boardCards, parentId]);

  // Everything that could legally be linked — self, already-parented cards and
  // ancestors are excluded by the shared guard, so the picker cannot create a
  // cycle or silently steal a subtask from another card.
  const linkable = useMemo(() => linkableUnder(boardCards, parentId), [boardCards, parentId]);
  const matches = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return q ? linkable.filter((c) => c.title.toLowerCase().includes(q)) : linkable;
  }, [linkable, filter]);

  const columnName = (columnId: string) =>
    columns.find((col) => col.id === columnId)?.name ?? '';

  function create() {
    const trimmed = newTitle.trim();
    if (!trimmed) return;
    setNewTitle('');
    onCreate(trimmed);
  }

  return (
    <View style={styles.wrap}>
      {children.length === 0 ? <Hint>No subtasks yet.</Hint> : null}

      {children.map((child) => (
        <Row key={child.id} style={styles.between}>
          {/* The whole row opens the subtask — it is a shortcut to that card,
              which is the entire point of the feature. */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Open subtask ${child.title}`}
            onPress={() => onOpen(child.id)}
            style={({ pressed }) => [styles.grow, pressed && { opacity: 0.6 }]}
          >
            <Body>{child.title}</Body>
            {/* Where it stands, so the list answers "is this done?" without
                opening each one. */}
            <Hint>{columnName(child.columnId)}</Hint>
          </Pressable>
          <IconAction
            icon="link-off"
            label={`Unlink subtask ${child.title}`}
            onPress={() => onUnlink(child.id)}
            disabled={busy}
          />
        </Row>
      ))}

      {/* Create is the common case — you are breaking this card down as you
          think — so it is the always-visible control, and linking an existing
          card is the one behind a picker. */}
      <Row style={styles.addRow}>
        <View style={styles.grow}>
          <TextField
            value={newTitle}
            onChangeText={setNewTitle}
            placeholder="New subtask"
            onSubmit={create}
            label="New subtask title"
            maxLength={CARD_TITLE_MAX}
          />
        </View>
        <IconAction
          icon="add"
          label="Add subtask"
          accent
          size={24}
          onPress={create}
          disabled={busy || !newTitle.trim()}
        />
      </Row>

      {picking ? (
        <View
          style={[
            styles.picker,
            { borderColor: t.border.subtle, backgroundColor: t.bg.inset },
          ]}
        >
          <Caption>Link an existing card</Caption>
          <TextField
            value={filter}
            onChangeText={setFilter}
            placeholder="Filter cards"
            label="Filter cards"
          />
          {matches.length === 0 ? (
            <Hint>
              {linkable.length === 0
                ? 'Every other card on this board is already a subtask somewhere.'
                : 'No cards match.'}
            </Hint>
          ) : null}
          {/* Capped and scrollable: the section must not grow with the board. */}
          <ScrollView style={styles.pickerList} nestedScrollEnabled>
            {matches.map((c) => (
              <Pressable
                key={c.id}
                accessibilityRole="button"
                accessibilityLabel={`Link ${c.title} as a subtask`}
                onPress={() => {
                  onLink(c.id);
                  setFilter('');
                  setPicking(false);
                }}
                style={({ pressed }) => [
                  styles.option,
                  {
                    backgroundColor: pressed ? t.bg.accentSoft : t.bg.surface,
                    borderColor: t.border.subtle,
                  },
                ]}
              >
                <Body>{c.title}</Body>
                <Hint>{columnName(c.columnId)}</Hint>
              </Pressable>
            ))}
          </ScrollView>
          <Button
            label="Cancel"
            variant="secondary"
            onPress={() => {
              setFilter('');
              setPicking(false);
            }}
          />
        </View>
      ) : (
        <Button
          label="Link an existing card"
          variant="secondary"
          onPress={() => setPicking(true)}
          disabled={linkable.length === 0}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  between: { justifyContent: 'space-between', alignItems: 'center' },
  grow: { flex: 1, gap: space.xs },
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
});
