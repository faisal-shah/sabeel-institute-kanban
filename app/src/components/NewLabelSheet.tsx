import { useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { LABEL_COLORS, LABEL_NAME_MAX, validateLabelName, type Label } from '@sabeel/shared';
import { Sheet } from './Sheet';
import { Button, Hint, Row, TextField } from './ui';
import { radius, useTheme } from '../theme';

/**
 * Coining a label from a card, with the name and colour owned here.
 *
 * This is the ONE label affordance a plain member gets: Board Settings, where
 * labels are curated, is manager-only, and needing a manager to coin a tag
 * while you are looking at the card it belongs on is exactly the friction that
 * made per-board labels get re-created everywhere.
 *
 * MOUNTED ONLY WHILE OPEN, so the draft is scoped to the sheet being open —
 * the same rule every other draft in this refactor follows. Held in the screen,
 * a name typed and abandoned came back the next time the sheet opened, where it
 * would usually fail validation as a duplicate of the label it had just made.
 */
export function NewLabelSheet({
  knownLabels,
  busy,
  onError,
  onCreate,
  onClose,
}: {
  /** `null` until the label list has loaded — uniqueness cannot be judged
   *  against a set that has not arrived, so the button stays disabled. */
  knownLabels: readonly Label[] | null;
  busy: boolean;
  onError: (message: string) => void;
  /** Creates the label AND applies it; rejects if either write fails. */
  onCreate: (name: string, color: string) => void;
  onClose: () => void;
}) {
  const t = useTheme();
  const [name, setName] = useState('');
  const [color, setColor] = useState<string>(LABEL_COLORS[0]);

  return (
    <Sheet visible title="New label" onClose={onClose}>
      <Hint>Labels are shared by every board.</Hint>
      <TextField
        value={name}
        onChangeText={setName}
        placeholder="Label name"
        maxLength={LABEL_NAME_MAX}
        autoFocus
      />
      <Row style={styles.wrap}>
        {LABEL_COLORS.map((colour) => (
          <Pressable
            key={colour}
            accessibilityRole="button"
            accessibilityLabel={`Label colour ${colour}`}
            onPress={() => setColor(colour)}
            style={[
              styles.swatch,
              {
                backgroundColor: colour,
                borderColor: color === colour ? t.text.primary : 'transparent',
              },
            ]}
          />
        ))}
      </Row>
      <Button
        label="Add label"
        busy={busy}
        disabled={busy || !name.trim() || knownLabels === null}
        onPress={() => {
          if (knownLabels === null) return;
          // Refused WITH A REASON, and the field stays as it is — retyping a
          // name to be told again which word was the problem is worse than the
          // duplicate.
          const problem = validateLabelName(name, knownLabels);
          if (problem) {
            onError(problem);
            return;
          }
          onCreate(name, color);
        }}
      />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  wrap: { flexWrap: 'wrap' },
  // Matches the picker in Board Settings, so choosing a colour looks the same
  // wherever a label is created.
  swatch: { width: 28, height: 28, borderRadius: radius.pill, borderWidth: 2 },
});
