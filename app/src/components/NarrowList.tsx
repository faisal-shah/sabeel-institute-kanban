/**
 * A list you narrow by typing, then pick from.
 *
 * The shape the card screen's assignee and subtask pickers already use — a
 * field, a capped scrolling list, and rows that say what picking them does. It
 * is a component here because the Filters sheet needs it three times over
 * (boards, labels, people) and three copies of a filter-and-pick loop is how
 * three slightly different behaviours get written by accident.
 *
 * `PickerList`, never a hand-rolled `ScrollView`: a capped scroller under a
 * FOCUSED `TextField` eats the tap on the row being picked — the row does not
 * even light up — and `PickerList` exists because that was found three separate
 * times. See its own note in `ui.tsx`.
 */
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { Body, Hint, PickerList, TextField } from './ui';
import { radius, space, useTheme } from '../theme';

export interface NarrowItem {
  id: string;
  name: string;
  /** A second line — an email, say. Also matched by the narrowing field. */
  detail?: string;
}

export function NarrowList({
  items,
  onPick,
  selectedIds,
  placeholder,
  actionVerb,
  empty,
}: {
  items: readonly NarrowItem[];
  onPick: (id: string) => void;
  /** Ids already chosen. Drawn as selected and STILL tappable, to un-choose. */
  selectedIds?: readonly string[];
  /** The field's label and placeholder, e.g. `Filter boards`. */
  placeholder: string;
  /**
   * Prefixes each row's accessible name, e.g. `Filter by`.
   *
   * Required rather than defaulted, because a bare name is what collides: a
   * label called "Archived" would otherwise answer to the same name as the
   * Archived chip behind the sheet, leaving two controls with one name for a
   * screen reader and for every test.
   */
  actionVerb: string;
  /** Shown when there is nothing to offer at all. */
  empty: string;
}) {
  const t = useTheme();
  // The draft belongs HERE, not to the screen: it changes on every keystroke,
  // and a screen holding it re-renders every list it draws per character.
  const [filter, setFilter] = useState('');

  const matches = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (i) =>
        i.name.toLowerCase().includes(q) ||
        (i.detail ?? '').toLowerCase().includes(q),
    );
  }, [items, filter]);

  if (items.length === 0) return <Hint>{empty}</Hint>;

  return (
    <>
      <TextField
        value={filter}
        onChangeText={setFilter}
        placeholder={placeholder}
        label={placeholder}
      />
      {matches.length === 0 ? <Hint>Nothing matches.</Hint> : null}
      <PickerList>
        {matches.map((i) => {
          const selected = selectedIds?.includes(i.id) ?? false;
          return (
            <Pressable
              key={i.id}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`${actionVerb} ${i.name}`}
              onPress={() => onPick(i.id)}
              style={({ pressed }) => [
                styles.option,
                {
                  // Three distinct fills, so pressing a row that is already
                  // chosen still shows it was pressed — the same order
                  // `SheetOption` uses.
                  backgroundColor: selected
                    ? t.bg.accentSoft
                    : pressed
                      ? t.bg.inset
                      : t.bg.surface,
                  borderColor: selected ? t.accent.base : t.border.subtle,
                },
              ]}
            >
              <Body>{i.name}</Body>
              {i.detail ? <Hint>{i.detail}</Hint> : null}
            </Pressable>
          );
        })}
      </PickerList>
    </>
  );
}

const styles = StyleSheet.create({
  option: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.sm,
    padding: space.md,
    marginBottom: space.xs,
    gap: space.xs,
    minHeight: 44,
    justifyContent: 'center',
  },
});
