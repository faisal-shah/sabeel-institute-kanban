/**
 * NATIVE (web sibling: RichEditor.web.tsx).
 *
 * Stage 3 replaces this with `react-native-enriched-html`, whose viability was
 * proved in the Stage 0 spike: it builds against the committed prebuild, and
 * keyboard-controller scrolls it clear of the IME with the toolbar and the
 * action row still visible.
 *
 * Until then this is the PLAIN-TEXT box, deliberately, and it loses nothing
 * that matters:
 *  - markdown IS valid plain text, so a description written on a phone stays
 *    correct;
 *  - anything formatted in a browser still RENDERS correctly here, because the
 *    renderer is shared and was never split;
 *  - @mention autocomplete is unchanged, because this delegates to
 *    `MentionField` whenever the caller supplies candidates.
 *
 * Only the ability to APPLY formatting lags, and only until stage 3 — which
 * ships in the same release, so no colleague ever sees the gap.
 */
import { CARD_DESCRIPTION_MAX, type MentionCandidate } from '@sabeel/shared';
import { MentionField } from './MentionField';
import { TextField } from './ui';

export function RichEditor({
  initialMarkdown,
  onChangeMarkdown,
  placeholder,
  autoFocus,
  candidates,
  prioritiseUids,
}: {
  initialMarkdown: string;
  onChangeMarkdown: (md: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  candidates?: readonly MentionCandidate[];
  prioritiseUids?: readonly string[];
  /**
   * Web only. A contenteditable exposes no placeholder for a test to select
   * on; native keeps its real placeholder, so this is accepted and unused here
   * rather than threaded through.
   */
  testID?: string;
}) {
  if (candidates) {
    return (
      <MentionField
        value={initialMarkdown}
        onChangeText={onChangeMarkdown}
        candidates={candidates}
        prioritiseUids={prioritiseUids}
        placeholder={placeholder}
        autoFocus={autoFocus}
      />
    );
  }
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
