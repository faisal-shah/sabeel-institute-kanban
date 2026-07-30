/**
 * NATIVE (web sibling: RichEditor.web.tsx).
 *
 * Stage 3 replaces this with `react-native-enriched-html`, whose viability was
 * proved in the Stage 0 spike — it builds against the committed prebuild and
 * keyboard-controller scrolls it clear of the IME with the toolbar and action
 * row still visible.
 *
 * Until then this is the PLAIN-TEXT box, deliberately: markdown is valid plain
 * text, so a description written on a phone stays correct, and a description
 * formatted in the browser still RENDERS correctly on a phone because the
 * renderer is shared. Only editing lags, and only until stage 3 — which ships
 * in the same release, so no colleague ever sees the gap.
 */
import { CARD_DESCRIPTION_MAX } from '@sabeel/shared';
import { TextField } from './ui';

export function RichEditor({
  initialMarkdown,
  onChangeMarkdown,
  placeholder,
  autoFocus,
}: {
  initialMarkdown: string;
  onChangeMarkdown: (md: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  return (
    <TextField
      value={initialMarkdown}
      onChangeText={onChangeMarkdown}
      placeholder={placeholder}
      autoFocus={autoFocus}
      multiline
      maxLength={CARD_DESCRIPTION_MAX}
    />
  );
}
