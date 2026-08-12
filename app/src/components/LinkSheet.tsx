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
import { useState } from 'react';
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
  return (
    <Sheet visible={visible} title="Add a link" onClose={onCancel}>
      {/* Unmount-scoped: `Sheet` renders nothing while closed, so the fields
          below mount fresh on each open and the lifecycle IS the reseed. */}
      <LinkFields initialText={initialText} onConfirm={onConfirm} />
    </Sheet>
  );
}

/**
 * The two fields, seeded ONCE at mount.
 *
 * They used to live in `LinkSheet` with a `useEffect([visible, initialText])`
 * putting them back, and that effect emptied both fields at random. Callers
 * compute `initialText` from the LIVE editor selection during render, and
 * opening the sheet moves focus into the modal — so the editor blurs, its
 * selection goes, the next parent render passes `initialText: ''`, and the
 * effect fires again on a sheet that is already open. Measured on the bench:
 * the selected word was lost as the sheet's label in 3 of 12 opens, and a URL
 * typed quickly enough went with it.
 *
 * Owning the draft here instead of reseeding it is the same rule the rest of
 * the app follows for text drafts, in the shape `BoardNameEditor` uses: the
 * component renders only while the field is open, so there is no state to keep
 * in step and nothing that can reach in and overwrite what was typed.
 */
function LinkFields({
  initialText,
  onConfirm,
}: {
  initialText: string;
  onConfirm: (href: string, text: string) => void;
}) {
  const [href, setHref] = useState('');
  const [text, setText] = useState(initialText);

  const trimmed = href.trim();
  const ok = isSafeHref(trimmed);

  return (
    <>
      {/*
        LABELS, not just placeholders — a placeholder is gone the moment there
        is anything in the field, and these two fields are otherwise identical.
        Filmed on a phone: the same URL pasted into both, because by then
        nothing on screen said which was which.

        Address first, and it takes the focus: it is the required one — the
        button stays disabled until it validates — and the label is optional,
        defaulting to the address itself.
      */}
      <Hint>Address</Hint>
      <TextField
        value={href}
        onChangeText={setHref}
        placeholder="https://…"
        label="Link address"
        autoFocus
        onSubmit={() => {
          if (ok) onConfirm(trimmed, text.trim() || trimmed);
        }}
      />
      <Hint>Text to show</Hint>
      <TextField
        value={text}
        onChangeText={setText}
        placeholder="Text to show"
        label="Text to show"
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
      </Row>
    </>
  );
}
