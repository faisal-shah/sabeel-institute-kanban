/**
 * A comment box with @mention autocomplete.
 *
 * ONE component rather than one per surface. The composer had this inline and
 * the edit box did not, which is exactly the drift a shared component prevents:
 * editing a comment offered no autocomplete at all, so the only way to mention
 * someone in an edit was to type the handle from memory — and even then it did
 * nothing, because the edit path never re-derived `mentionUids` (see
 * `editComment`). Two boxes doing "the same thing" is how one of them quietly
 * stops doing it. Only the KEY handling is split by platform (mentionKeys.ts).
 *
 * The list is a POPOVER above the field, and both halves of that were learned on
 * a device rather than reasoned about.
 *
 * It used to sit INLINE between the field and the Comment button. `Screen`
 * scrolls a focused input clear of the keyboard by `KEYBOARD_BOTTOM_OFFSET` —
 * 96px, sized for a field plus the action row under it — so anything taller in
 * that gap is behind the keyboard. On a phone you typed "@" and saw the word
 * "Mention" and nothing else: thirteen people on the board, none reachable.
 *
 * Moving it inline ABOVE the field then broke it the other way. The keyboard
 * -aware scroller positions the field when it takes focus; inserting 240px above
 * it afterwards pushes the field DOWN without triggering another scroll, so the
 * list was visible and the box you were typing into was not.
 *
 * Absolute positioning is what resolves both: the popover takes no part in
 * layout, so the field never moves from where the scroller put it, and the list
 * floats over the card content above — which is what every autocomplete does.
 */
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View, type TextInput } from 'react-native';
import {
  COMMENT_BODY_MAX,
  activeMentionQuery,
  completeMention,
  handleFor,
  mentionSuggestions,
  type MentionCandidate,
} from '@sabeel/shared';
import { useMentionKeys } from '../mentionKeys';
import { Body, Caption, Hint, TextField } from './ui';
import { radius, space, useTheme } from '../theme';

/** Fixed so the highlighted row can be scrolled to without measuring it. */
const ROW_HEIGHT = 60;
/** Four rows, then it scrolls — the cap AssigneePicker settled on. */
const LIST_MAX_HEIGHT = ROW_HEIGHT * 4;

export const MentionField = forwardRef<TextInput, {
  value: string;
  onChangeText: (next: string) => void;
  candidates: readonly MentionCandidate[];
  /**
   * People to float to the top — the card's assignees. On a board carrying the
   * whole organisation this is usually the entire fix: the person you meant is
   * the first row, so there is nothing to scroll.
   */
  prioritiseUids?: readonly string[];
  placeholder?: string;
  autoFocus?: boolean;
}>(function MentionField(
  { value, onChangeText, candidates, prioritiseUids, placeholder, autoFocus },
  ref,
) {
  const t = useTheme();
  const input = useRef<TextInput>(null);
  const list = useRef<ScrollView>(null);
  useImperativeHandle(ref, () => input.current as TextInput);

  // The autocomplete only appears while a mention is actually being typed —
  // showing a people-picker permanently would be noise.
  const query = activeMentionQuery(value);
  const suggestions = useMemo(
    () =>
      query === null
        ? []
        : mentionSuggestions(query, candidates, { prioritise: prioritiseUids }),
    [query, candidates, prioritiseUids],
  );

  /** Escape closes the list; typing anything else brings it back. */
  const [dismissedFor, setDismissedFor] = useState<string | null>(null);
  const [highlighted, setHighlighted] = useState(0);

  const open = suggestions.length > 0 && query !== dismissedFor;

  // Narrowing the query shortens the list, so an index chosen against the old
  // one can point past the end. Reset on every change rather than clamping
  // after the fact: the top match is what someone wants after typing more.
  useEffect(() => {
    setHighlighted(0);
  }, [query]);

  // Belt and braces — state resets are asynchronous, so a render can still land
  // with the previous index against the new list.
  const index = Math.min(highlighted, Math.max(0, suggestions.length - 1));

  const accept = useCallback(
    (candidate: MentionCandidate) => {
      onChangeText(completeMention(value, '', candidate));
      setDismissedFor(null);
      // Picking a suggestion BLURS the box — whether by click or by tab-then-
      // enter — and without this you cannot carry on typing, which makes the
      // autocomplete a trap rather than a shortcut. Refocus on the next tick,
      // after the blur has settled.
      setTimeout(() => input.current?.focus(), 0);
    },
    [onChangeText, value],
  );

  const keyProps = useMentionKeys({
    active: open,
    onMove: (delta) => {
      const next = (index + delta + suggestions.length) % suggestions.length;
      setHighlighted(next);
      // Without this, arrowing past the fourth row highlights something that is
      // scrolled out of sight and the list appears to stop responding.
      list.current?.scrollTo({ y: next * ROW_HEIGHT, animated: true });
    },
    onAccept: () => {
      const pick = suggestions[index];
      if (pick) accept(pick);
    },
    onDismiss: () => setDismissedFor(query),
  });

  return (
    <View style={styles.wrap}>
      {open ? (
        <View
          style={[
            styles.popover,
            { borderColor: t.border.subtle, backgroundColor: t.bg.inset },
          ]}
        >
          <Caption>
            Mention{suggestions.length > 4 ? ` — ${suggestions.length} people` : ''}
          </Caption>
          {/* `keyboardShouldPersistTaps` is NOT optional here and is not
              inherited from the Screen's scroll view. This list is used with the
              keyboard up, and without it the first tap on a name only dismisses
              the keyboard — the pick never fires and the row looks dead. */}
          <ScrollView
            ref={list}
            style={styles.list}
            nestedScrollEnabled
            keyboardShouldPersistTaps="handled"
          >
            {suggestions.map((s, i) => (
              <Pressable
                key={s.uid}
                accessibilityRole="button"
                accessibilityLabel={`Mention ${s.displayName}`}
                accessibilityState={{ selected: i === index }}
                onPress={() => accept(s)}
                style={({ pressed }) => [
                  styles.option,
                  {
                    borderColor: i === index ? t.accent.base : t.border.subtle,
                    backgroundColor:
                      pressed || i === index ? t.bg.accentSoft : t.bg.surface,
                  },
                ]}
              >
                <Body numberOfLines={1}>{s.displayName}</Body>
                {/* The handle, not the email: it is what actually gets typed
                    into the comment, so showing anything else makes the result
                    of picking a surprise. */}
                <Hint>@{handleFor(s.email)}</Hint>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}

      <TextField
        ref={input}
        value={value}
        onChangeText={(next) => {
          // Any edit re-opens a list that Escape closed.
          setDismissedFor(null);
          onChangeText(next);
        }}
        placeholder={placeholder}
        autoFocus={autoFocus}
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
  popover: {
    // Out of flow entirely — see the note at the top. `bottom: '100%'` puts its
    // bottom edge on the wrapper's top edge, i.e. directly above the field.
    position: 'absolute',
    bottom: '100%',
    left: 0,
    right: 0,
    marginBottom: space.xs,
    // Both, deliberately: iOS/web stack on zIndex, Android on elevation. The
    // elevation also gives it a shadow, which is what makes it read as floating
    // over the comments rather than as part of them.
    zIndex: 10,
    elevation: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    padding: space.sm,
    gap: space.xs,
  },
  list: { maxHeight: LIST_MAX_HEIGHT },
  option: {
    height: ROW_HEIGHT,
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.sm,
    paddingHorizontal: space.md,
    marginBottom: space.xs,
  },
});
