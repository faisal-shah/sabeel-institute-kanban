/**
 * A comment box with @mention autocomplete.
 *
 * ONE component rather than one per surface. The composer had this inline and
 * the edit box did not, which is exactly the drift a shared component prevents:
 * editing a comment offered no autocomplete at all, so the only way to mention
 * someone in an edit was to type the handle from memory — and even then it did
 * nothing, because the edit path never re-derived `mentionUids` (see
 * `editComment`). Two boxes doing "the same thing" is how one of them quietly
 * stops doing it.
 */
import { forwardRef, useImperativeHandle, useRef } from 'react';
import { StyleSheet, View, type TextInput } from 'react-native';
import {
  COMMENT_BODY_MAX,
  activeMentionQuery,
  completeMention,
  handleFor,
  mentionSuggestions,
  type MentionCandidate,
} from '@sabeel/shared';
import { Button, Caption, TextField } from './ui';
import { space, useTheme } from '../theme';

export const MentionField = forwardRef<TextInput, {
  value: string;
  onChangeText: (next: string) => void;
  candidates: readonly MentionCandidate[];
  placeholder?: string;
  autoFocus?: boolean;
}>(function MentionField(
  { value, onChangeText, candidates, placeholder, autoFocus },
  ref,
) {
  const t = useTheme();
  const input = useRef<TextInput>(null);
  useImperativeHandle(ref, () => input.current as TextInput);

  // The autocomplete only appears while a mention is actually being typed —
  // showing a people-picker permanently would be noise.
  const query = activeMentionQuery(value);
  const suggestions = query === null ? [] : mentionSuggestions(query, candidates);

  return (
    <>
      <TextField
        ref={input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        autoFocus={autoFocus}
        multiline
        maxLength={COMMENT_BODY_MAX}
      />
      {suggestions.length > 0 ? (
        <View style={[styles.suggestions, { borderColor: t.border.subtle }]}>
          <Caption>Mention</Caption>
          {suggestions.map((s) => (
            <Button
              key={s.uid}
              label={`${s.displayName} (@${handleFor(s.email)})`}
              variant="secondary"
              onPress={() => {
                onChangeText(completeMention(value, '', s));
                // Picking a suggestion BLURS the box — whether by click or by
                // tab-then-enter — and without this you cannot carry on typing,
                // which makes the autocomplete a trap rather than a shortcut.
                // Refocus on the next tick, after the blur has settled.
                setTimeout(() => input.current?.focus(), 0);
              }}
            />
          ))}
        </View>
      ) : null}
    </>
  );
});

const styles = StyleSheet.create({
  suggestions: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    padding: space.sm,
    gap: space.xs,
  },
});
