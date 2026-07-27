import { useCallback } from 'react';
import type { TextInputProps } from 'react-native';
import type { MentionKeyActions } from './mentionKeys';

/**
 * Keyboard control of the @mention list — WEB (native sibling: mentionKeys.ts).
 *
 * On a desktop the hands are already on the keys, so reaching for the mouse to
 * pick a name is the slow path. Arrows move, Enter or Tab accepts, Escape closes.
 *
 * `preventDefault` ONLY while the list is open, and that gating is the whole
 * subtlety. The comment box is `multiline`: Enter has to keep inserting a
 * newline when nothing is being suggested, and Tab has to keep moving focus, or
 * this trades one broken interaction for two.
 */
export function useMentionKeys(
  actions: MentionKeyActions,
): Pick<TextInputProps, 'onKeyPress'> {
  const { active, onMove, onAccept, onDismiss } = actions;

  const onKeyPress = useCallback(
    (e: { nativeEvent: { key: string }; preventDefault?: () => void }) => {
      if (!active) return;
      const { key } = e.nativeEvent;

      // Escape is worth handling even though it changes no text: without it the
      // only way to dismiss a list you did not want is to delete the "@".
      const handled =
        key === 'ArrowDown' ||
        key === 'ArrowUp' ||
        key === 'Enter' ||
        key === 'Tab' ||
        key === 'Escape';
      if (!handled) return;

      e.preventDefault?.();

      if (key === 'ArrowDown') onMove(1);
      else if (key === 'ArrowUp') onMove(-1);
      else if (key === 'Escape') onDismiss();
      else onAccept();
    },
    [active, onMove, onAccept, onDismiss],
  );

  return { onKeyPress: onKeyPress as TextInputProps['onKeyPress'] };
}
