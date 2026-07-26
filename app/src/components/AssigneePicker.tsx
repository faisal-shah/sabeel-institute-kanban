import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import type { BoardMemberProfile } from '../boards';
import { Body, Button, Caption, Hint, IconAction, Row } from './ui';
import { radius, space, useTheme } from '../theme';

/**
 * Assignees on a card.
 *
 * Shows who IS assigned as a short list, and hides everyone else behind a
 * compact, scrollable picker. The first version listed every board member with
 * an Assign/Unassign button, which meant the section grew with the board and
 * pushed the rest of the card off the screen — on a board of twenty people the
 * card detail became mostly a directory.
 *
 * The picker is capped in height and scrolls internally, so the section stays
 * the same size whether the board has three members or thirty.
 */
export function AssigneePicker({
  members,
  assignedUids,
  onToggle,
  busy,
  emptyHint,
  picking,
  onPickingChange,
}: {
  members: readonly BoardMemberProfile[];
  assignedUids: readonly string[];
  onToggle: (uid: string, assign: boolean) => void;
  busy?: boolean;
  /** Shown when the board has nobody else to assign — explains what to do. */
  emptyHint?: string;
  /**
   * Whether the picker is open. CONTROLLED by the parent because the control
   * that opens it lives on the section heading, outside this component — see
   * `Heading`'s `action` slot. Keeping the state here would mean the trigger
   * could not reach it.
   */
  picking: boolean;
  onPickingChange: (next: boolean) => void;
}) {
  const t = useTheme();

  const assigned = useMemo(
    () => members.filter((m) => assignedUids.includes(m.uid)),
    [members, assignedUids],
  );
  const available = useMemo(
    () => members.filter((m) => !assignedUids.includes(m.uid)),
    [members, assignedUids],
  );

  // An assignee who is no longer a board member (removed while assigned) would
  // otherwise vanish from the UI while remaining on the card. Surface them so
  // they can be removed.
  const orphaned = assignedUids.filter((uid) => !members.some((m) => m.uid === uid));

  return (
    <View style={styles.wrap}>
      {assigned.length === 0 && orphaned.length === 0 ? (
        <Hint>Nobody is assigned.</Hint>
      ) : null}

      {assigned.map((m) => (
        <Row key={m.uid} style={styles.between}>
          <View style={styles.grow}>
            <Body>{m.displayName}</Body>
            <Hint>{m.email}</Hint>
          </View>
          <IconAction
            icon="person-remove"
            label={`Unassign ${m.displayName}`}
            disabled={busy}
            onPress={() => onToggle(m.uid, false)}
          />
        </Row>
      ))}

      {orphaned.map((uid) => (
        <Row key={uid} style={styles.between}>
          <View style={styles.grow}>
            <Body>Someone no longer on this board</Body>
            <Hint>Assigned before they were removed</Hint>
          </View>
          <IconAction
            icon="person-remove"
            label="Unassign this person"
            disabled={busy}
            onPress={() => onToggle(uid, false)}
          />
        </Row>
      ))}

      {available.length === 0 ? (
        <Caption>
          {emptyHint ??
            'Everyone on this board is already assigned. Add more people in board Settings.'}
        </Caption>
      ) : picking ? (
        <View
          style={[
            styles.picker,
            { borderColor: t.border.subtle, backgroundColor: t.bg.inset },
          ]}
        >
          <Caption>Assign someone</Caption>
          {/* Capped and scrollable: the section must not grow with the board. */}
          <ScrollView style={styles.pickerList} nestedScrollEnabled>
            {available.map((m) => (
              <Pressable
                key={m.uid}
                accessibilityRole="button"
                accessibilityLabel={`Assign ${m.displayName}`}
                onPress={() => {
                  onToggle(m.uid, true);
                  // Stay open: assigning two or three people in a row is the
                  // common case, and reopening each time is friction.
                }}
                style={({ pressed }) => [
                  styles.option,
                  {
                    backgroundColor: pressed ? t.bg.accentSoft : t.bg.surface,
                    borderColor: t.border.subtle,
                  },
                ]}
              >
                <Body>{m.displayName}</Body>
                <Hint>{m.email}</Hint>
              </Pressable>
            ))}
          </ScrollView>
          <Button
            label="Done"
            variant="secondary"
            onPress={() => onPickingChange(false)}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  between: { justifyContent: 'space-between' },
  grow: { flex: 1, gap: space.xs },
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
