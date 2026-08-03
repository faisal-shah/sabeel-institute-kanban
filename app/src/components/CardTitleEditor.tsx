import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { CARD_TITLE_MAX } from '@sabeel/shared';
import { Button, Hint, IconAction, Row, TextField, Title } from './ui';
import { space } from '../theme';

/**
 * The card's title, and the draft of it.
 *
 * `ColumnNameEditor`'s shape: ONE piece of state encodes both "am I editing"
 * and "what has been typed", so the two cannot disagree. `null` is at rest.
 *
 * THIS IS WHAT RETIRES THE TITLE/DESCRIPTION CLOBBER BUG.
 *
 * The card screen used to hold `title`, `titleDirty`, `editingTitle` and a
 * seeding effect, alongside the same four for the description. They shared one
 * dirty flag at first, so saving the title cleared it, re-armed the effect and
 * silently overwrote an unsaved description with the server's copy — a long
 * description lost with no error and nothing to undo. Splitting the flags fixed
 * it by convention. With both drafts owned by their own components, the screen
 * holds no draft and no seeding effect at all, and one editor cannot reach the
 * other's state to stomp on it.
 *
 * Typing here also no longer re-renders the comments, activity and attachments
 * below, which is why those no longer need to be memoised.
 */
export function CardTitleEditor({
  title,
  busy,
  run,
  onSave,
}: {
  /** The SERVER's copy. Rendered directly at rest, so there is nothing to seed. */
  title: string;
  busy: boolean;
  /** Shared with the rest of the screen, so two saves cannot overlap and errors
   *  reach the one banner the screen already renders. */
  run: (fn: () => Promise<unknown>) => void;
  /** Rejects if the write fails — which is what keeps the field open. */
  onSave: (next: string) => Promise<unknown>;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const editing = draft !== null;

  // CLOSES ONLY ONCE THE WRITE LANDS. `run` reports the failure and the throw
  // never reaches `setDraft(null)`, so a failed save leaves your text on screen
  // instead of discarding it behind an error message.
  function save(next: string) {
    // An empty title is a half-finished edit, not a save — and the rules reject
    // it anyway (title.size() > 0). Reachable by pressing Enter, which the
    // disabled Save button does not cover.
    if (!next) return;
    run(async () => {
      await onSave(next);
      setDraft(null);
    });
  }

  if (editing) {
    const trimmed = draft.trim();
    return (
      <>
        <Hint>Title</Hint>
        <TextField
          value={draft}
          onChangeText={setDraft}
          maxLength={CARD_TITLE_MAX}
          autoFocus
          label="Card title"
          onSubmit={() => save(trimmed)}
        />
        <Row>
          <Button
            busy={busy}
            label="Save"
            disabled={!trimmed || trimmed === title}
            onPress={() => save(trimmed)}
          />
          <Button label="Cancel" variant="secondary" onPress={() => setDraft(null)} />
        </Row>
      </>
    );
  }

  return (
    <Row style={styles.between}>
      {/* A HEADING, not a card tile. `CardFace` truncates a long title, so on
          the one screen dedicated to that card it could not be read in full. */}
      <View style={styles.grow}>
        <Title>{title}</Title>
      </View>
      <IconAction
        icon="edit"
        label="Edit title"
        onPress={() => setDraft(title)}
        disabled={busy}
      />
    </Row>
  );
}

const styles = StyleSheet.create({
  between: { justifyContent: 'space-between' },
  grow: { flex: 1, gap: space.xs },
});
