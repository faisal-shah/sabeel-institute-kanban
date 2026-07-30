/**
 * The formatting toolbar — shared policy, both surfaces.
 *
 * Which five buttons exist, in what order, with what icons and labels, and how
 * an active one looks, all live here. Only the COMMANDS differ per platform
 * (Lexical `dispatchCommand` vs the native editor's ref methods), and they
 * arrive injected — the same division `useMentionPolicy` draws.
 *
 * Icons rather than labelled buttons, per the standing rule: five labelled
 * buttons would cost a row of vertical space above every description and
 * comment box, on a screen that is already long. Each carries the word it
 * replaces on `accessibilityLabel`, and `IconAction` supplies a 44px target
 * around small ink.
 */
import { StyleSheet, View } from 'react-native';
import { IconAction } from './ui';
import { space } from '../theme';

/** What the toolbar can do. Implemented per platform; the list is fixed. */
export interface RichCommands {
  toggleBold: () => void;
  toggleItalic: () => void;
  toggleBullets: () => void;
  toggleNumbers: () => void;
  /** Opens the link sheet; the caller supplies the href once chosen. */
  promptLink: () => void;
}

/** Which marks are active at the caret, so the toolbar can show state. */
export interface RichMarks {
  bold: boolean;
  italic: boolean;
  bullets: boolean;
  numbers: boolean;
  link: boolean;
}

export function RichToolbar({
  commands,
  marks,
  disabled,
}: {
  commands: RichCommands;
  marks: RichMarks;
  disabled?: boolean;
}) {
  return (
    <View style={styles.bar}>
      <IconAction
        icon="format-bold"
        label="Bold"
        selected={marks.bold}
        disabled={disabled}
        onPress={commands.toggleBold}
      />
      <IconAction
        icon="format-italic"
        label="Italic"
        selected={marks.italic}
        disabled={disabled}
        onPress={commands.toggleItalic}
      />
      <IconAction
        icon="format-list-bulleted"
        label="Bullet list"
        selected={marks.bullets}
        disabled={disabled}
        onPress={commands.toggleBullets}
      />
      <IconAction
        icon="format-list-numbered"
        label="Numbered list"
        selected={marks.numbers}
        disabled={disabled}
        onPress={commands.toggleNumbers}
      />
      <IconAction
        icon="link"
        label="Link"
        selected={marks.link}
        disabled={disabled}
        onPress={commands.promptLink}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  // Small gap: IconAction already carries its own 44px target inside the box,
  // so the separation is inside the button rather than between them.
  bar: { flexDirection: 'row', gap: space.xs },
});
