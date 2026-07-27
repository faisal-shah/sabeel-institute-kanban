import type { TextInputProps } from 'react-native';

/**
 * Keyboard control of the @mention list — NATIVE (web sibling:
 * mentionKeys.web.ts).
 *
 * There is nothing to do here. A phone has no arrow keys, and the soft keyboard
 * offers no way to move a selection: you tap the person you want.
 *
 * Only the key PLUMBING is split by platform. The list, its ordering and which
 * row is highlighted all stay in MentionField, whose own docstring is about
 * exactly this hazard — "two boxes doing the same thing is how one of them
 * quietly stops doing it". A MentionField.web.tsx would be that mistake.
 */
export interface MentionKeyActions {
  /** Whether the list is open; when it is not, every key must behave normally. */
  active: boolean;
  /** Move the highlight by `delta`, wrapping at both ends. */
  onMove: (delta: number) => void;
  /** Accept the highlighted row. */
  onAccept: () => void;
  /** Close the list without picking. */
  onDismiss: () => void;
}

export function useMentionKeys(_actions: MentionKeyActions): Pick<TextInputProps, 'onKeyPress'> {
  return {};
}
