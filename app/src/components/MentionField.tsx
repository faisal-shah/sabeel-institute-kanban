/**
 * A plain-text comment box with @mention autocomplete.
 *
 * ONE component rather than one per surface. The composer had this inline and
 * the edit box did not, which is exactly the drift a shared component prevents:
 * editing a comment offered no autocomplete at all, so the only way to mention
 * someone in an edit was to type the handle from memory — and even then it did
 * nothing, because the edit path never re-derived `mentionUids`. Two boxes doing
 * "the same thing" is how one of them quietly stops doing it.
 *
 * The popover and the state machine now live in `MentionList` and
 * `useMentionPolicy`, shared with the rich editors for exactly that reason.
 * What remains here is the plumbing only this box needs.
 *
 * CARET, OR THE LACK OF ONE — and it is why the rich editors can do better.
 * `activeMentionQuery` is `$`-anchored, so a mention must be the last thing in
 * the box: put the caret in the middle, type `@`, and nothing opens.
 * `completeMention` is likewise handed an empty tail. Both shared helpers
 * accept a real before/after split; this box cannot supply one, because React
 * Native's `TextInput` exposes no reliable cross-platform selection. That is a
 * limitation of the widget, not of the feature.
 */
import { forwardRef, useImperativeHandle, useRef } from 'react';
import { StyleSheet, View, type TextInput } from 'react-native';
import {
  COMMENT_BODY_MAX,
  activeMentionQuery,
  completeMention,
  type MentionCandidate,
} from '@sabeel/shared';
import { TextField } from './ui';
import { MentionList, ROW_PITCH } from './MentionList';
import { useMentionPolicy } from './useMentionPolicy';
import { useMentionKeys } from '../mentionKeys';
import { space } from '../theme';

export const MentionField = forwardRef<
  TextInput,
  {
    value: string;
    onChangeText: (v: string) => void;
    candidates: readonly MentionCandidate[];
    prioritiseUids?: readonly string[];
    placeholder?: string;
    autoFocus?: boolean;
  }
>(function MentionField(
  { value, onChangeText, candidates, prioritiseUids, placeholder, autoFocus },
  ref,
) {
  const input = useRef<TextInput>(null);
  useImperativeHandle(ref, () => input.current as TextInput);
  /** Measured on first layout — see MentionList; a fixed pitch scrolls wrong at
   *  large system font sizes. */
  const pitch = useRef(ROW_PITCH);

  const query = activeMentionQuery(value);

  const policy = useMentionPolicy({
    query,
    candidates,
    prioritiseUids,
    rowPitch: pitch.current,
    onInsert: (c) => onChangeText(completeMention(value, '', c, COMMENT_BODY_MAX)),
    onRefocus: () => input.current?.focus(),
  });

  const keyProps = useMentionKeys({
    active: policy.open,
    onMove: policy.move,
    onAccept: () => {
      const s = policy.suggestions[policy.index];
      if (s) policy.accept(s);
    },
    onDismiss: policy.dismiss,
  });

  return (
    <View style={styles.wrap}>
      {policy.open ? (
        <MentionList
          suggestions={policy.suggestions}
          index={policy.index}
          listRef={policy.listRef}
          onPick={policy.accept}
          onMeasureRow={(p) => {
            pitch.current = p;
          }}
        />
      ) : null}

      <TextField
        ref={input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onFocus={policy.onFocus}
        onBlur={policy.onBlur}
        multiline
        maxLength={COMMENT_BODY_MAX}
        {...keyProps}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  /** Positioning context for the popover. RN Views are `relative` by default. */
  wrap: { gap: space.xs },
});
