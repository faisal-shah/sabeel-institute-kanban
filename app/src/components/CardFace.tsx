import { StyleSheet, Text, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { bucketFor, describeDue, todayInOrgTz, type BoardLabel, type Priority } from '@sabeel/shared';
import type { BoardMemberProfile } from '../boards';
import { AssigneeChip, Body, ColorBadge, PriorityBadge } from './ui';
import { space, type, useTheme } from '../theme';

/**
 * The at-a-glance content of a card — title, then priority + labels + due, then
 * assignee chips. The SINGLE definition of a card face: every surface (the three
 * board layouts, My Work, Search) embeds this inside its own interaction
 * container, so the face is described once and a new field is a one-line change
 * here. Purely presentational: it resolves label/assignee ids against the board's
 * `labels`/`members` (passed in) and draws — no data loading, no interaction.
 */
export function CardFace({
  card,
  boardLabels,
  boardMembers,
}: {
  card: {
    title: string;
    priority: Priority;
    dueDate?: string;
    labelIds: string[];
    assigneeUids: string[];
  };
  boardLabels: readonly BoardLabel[];
  boardMembers: readonly BoardMemberProfile[];
}) {
  const t = useTheme();
  const today = todayInOrgTz();

  const labels = card.labelIds
    .map((id) => boardLabels.find((l) => l.id === id))
    .filter((l): l is BoardLabel => !!l);
  const assignees = card.assigneeUids
    .map((uid) => boardMembers.find((m) => m.uid === uid))
    .filter((m): m is BoardMemberProfile => !!m);

  const overdue = bucketFor(card.dueDate, today) === 'overdue';
  const dueColor = overdue ? t.text.danger : t.text.muted;
  const hasMeta = card.priority !== 'none' || labels.length > 0 || !!card.dueDate;

  return (
    <View style={styles.face}>
      <Body>{card.title}</Body>

      {hasMeta ? (
        <View style={styles.metaRow}>
          <PriorityBadge priority={card.priority} />
          {labels.map((l) => (
            <ColorBadge key={l.id} color={l.color} label={l.name} />
          ))}
          {card.dueDate ? (
            <View style={styles.due}>
              <MaterialIcons name="event" size={13} color={dueColor} />
              <Text style={[type.caption, { color: dueColor }]}>
                {describeDue(card.dueDate, today)}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {assignees.length > 0 ? (
        <View style={styles.assigneeRow}>
          {assignees.map((m) => (
            <AssigneeChip key={m.uid} name={m.displayName} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  face: { gap: space.xs },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.xs },
  assigneeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  due: { flexDirection: 'row', alignItems: 'center', gap: 2 },
});
