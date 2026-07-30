/**
 * Adding a link — one sheet, both surfaces.
 *
 * A `prompt()` would have been shorter and is not available on native; a
 * separate inline row would cost vertical space on a screen that has none to
 * spare. The existing `Sheet` is what the app already uses for "one decision,
 * then get out of the way".
 *
 * Validation is the SHARED `isSafeHref`, not a second opinion: the renderer
 * refuses anything it disallows, so a link accepted here and dropped at render
 * would be a silent, confusing loss.
 */
import { useEffect, useState } from 'react';
import { isSafeHref } from '@sabeel/shared';
import { Sheet } from './Sheet';
import { Button, Hint, Row, TextField } from './ui';

export function LinkSheet({
  visible,
  initialText,
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  /** The selected text, which becomes the link's label. */
  initialText: string;
  onCancel: () => void;
  onConfirm: (href: string, text: string) => void;
}) {
  const [href, setHref] = useState('');
  const [text, setText] = useState(initialText);

  // Reseed each time it opens: a stale URL from the last link is worse than an
  // empty box, because it looks deliberate.
  useEffect(() => {
    if (visible) {
      setHref('');
      setText(initialText);
    }
  }, [visible, initialText]);

  const trimmed = href.trim();
  const ok = isSafeHref(trimmed);

  return (
    <Sheet visible={visible} title="Add a link" onClose={onCancel}>
      <TextField
        value={text}
        onChangeText={setText}
        placeholder="Text to show"
        autoFocus
      />
      <TextField
        value={href}
        onChangeText={setHref}
        placeholder="https://…"
        onSubmit={() => {
          if (ok) onConfirm(trimmed, text.trim() || trimmed);
        }}
      />
      {trimmed.length > 0 && !ok ? (
        <Hint>Links must start with http://, https:// or mailto:.</Hint>
      ) : null}
      <Row>
        <Button
          label="Add link"
          disabled={!ok}
          onPress={() => onConfirm(trimmed, text.trim() || trimmed)}
        />
        <Button label="Cancel" variant="secondary" onPress={onCancel} />
      </Row>
    </Sheet>
  );
}
