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
import { Body, Hint, TextField } from './ui';
import { radius, space, useTheme } from '../theme';

/**
 * Row geometry, in ONE place because three things have to agree: the row's own
 * height, how far `scrollTo` jumps per row, and how tall the list may get.
 *
 * The pitch is the height PLUS the gap under it, and that is the whole reason
 * this is derived rather than written out. Scrolling by the bare height drifts
 * by one gap per row — four pixels looks like nothing until row twelve, where
 * the cumulative error is most of a row and arrowing to the bottom of the list
 * scrolls to the wrong person.
 */
const ROW_HEIGHT = 60;
const ROW_GAP = space.xs;
/** Starting guess. The real pitch is measured — see `pitch` below. */
const ROW_PITCH = ROW_HEIGHT + ROW_GAP;
/** Four rows, then it scrolls — the cap AssigneePicker settled on. */
const VISIBLE_ROWS = 4;
/**
 * How long a blur waits before closing the list.
 *
 * It CANNOT close immediately. On web a click fires mousedown → blur → click, so
 * unmounting the row on blur destroys the thing being clicked and the pick never
 * happens — trading a lingering popover for a broken one. `accept` refocuses on
 * the next tick, which cancels the pending close, so a real pick never sees it.
 */
const BLUR_GRACE_MS = 200;
const LIST_MAX_HEIGHT = ROW_PITCH * VISIBLE_ROWS;

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

  /**
   * The real height of a row, measured rather than assumed.
   *
   * `ROW_HEIGHT` is a MINIMUM, not a fact: text scales with the reader's system
   * font size, so at the largest accessibility setting two lines no longer fit
   * in 60px. A fixed height would clip the name; a fixed pitch would scroll to
   * the wrong row. Measuring the first one costs one layout pass and is correct
   * at every scale.
   */
  const [pitch, setPitch] = useState(ROW_PITCH);

  /** Escape closes the list; typing anything else brings it back. */
  /** Whether the box has focus. A draft left ending in "@sa" used to keep the
   *  popover on screen indefinitely, floating over the card. */
  const [focused, setFocused] = useState(false);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelPendingBlur = useCallback(() => {
    if (blurTimer.current !== null) {
      clearTimeout(blurTimer.current);
      blurTimer.current = null;
    }
  }, []);
  useEffect(() => cancelPendingBlur, [cancelPendingBlur]);

  const [dismissedFor, setDismissedFor] = useState<string | null>(null);
  const [highlighted, setHighlighted] = useState(0);
  /**
   * The highlight again, synchronously.
   *
   * Held-down arrow keys repeat about every 33ms and React renders in about 16,
   * so two moves can land against the same state value and the highlight stops
   * one short. Same reason the attachment row keeps a ref beside its `busy`:
   * state is a frame late, and key repeat is faster than a frame.
   */
  const highlightRef = useRef(0);

  const open = focused && suggestions.length > 0 && query !== dismissedFor;

  // Narrowing the query shortens the list, so an index chosen against the old
  // one can point past the end. Reset on every change rather than clamping
  // after the fact: the top match is what someone wants after typing more.
  useEffect(() => {
    setHighlighted(0);
    highlightRef.current = 0;
    // The list is capped and stays MOUNTED while you keep typing, so narrowing
    // from ten matches to two leaves it scrolled past the end — a popover
    // showing blank space. Put it back to the top with the highlight.
    list.current?.scrollTo({ y: 0, animated: false });
  }, [query]);

  // Belt and braces — state resets are asynchronous, so a render can still land
  // with the previous index against the new list.
  const index = Math.min(highlighted, Math.max(0, suggestions.length - 1));
  highlightRef.current = index;

  const accept = useCallback(
    (candidate: MentionCandidate) => {
      onChangeText(completeMention(value, '', candidate, COMMENT_BODY_MAX));
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
      const from = highlightRef.current;
      const next = (from + delta + suggestions.length) % suggestions.length;
      highlightRef.current = next;
      setHighlighted(next);
      // Without this, arrowing past the fourth row highlights something that is
      // scrolled out of sight and the list appears to stop responding.
      list.current?.scrollTo({ y: next * pitch, animated: true });
    },
    onAccept: () => {
      const pick = suggestions[highlightRef.current];
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
          {/* Hint, not Caption. Both are caption-SIZED; the difference is the
              colour, and `Caption` is text.muted — 2.34:1 on this background,
              which fails WCAG AA and even the 3:1 floor for non-text. `Hint` is
              text.secondary at 5.10:1. */}
          <Hint>
            Mention
            {suggestions.length > VISIBLE_ROWS ? ` — ${suggestions.length} people` : ''}
          </Hint>
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
                onLayout={
                  i === 0
                    ? (e) => setPitch(e.nativeEvent.layout.height + ROW_GAP)
                    : undefined
                }
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
        onFocus={() => {
          cancelPendingBlur();
          setFocused(true);
        }}
        onBlur={() => {
          cancelPendingBlur();
          blurTimer.current = setTimeout(() => setFocused(false), BLUR_GRACE_MS);
        }}
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
    // MINIMUM, not fixed: at a large system font size the two lines need more,
    // and clipping someone's name is worse than a taller list.
    minHeight: ROW_HEIGHT,
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.sm,
    paddingHorizontal: space.md,
    marginBottom: ROW_GAP,
  },
});
