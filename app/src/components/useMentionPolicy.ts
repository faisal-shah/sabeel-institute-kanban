/**
 * Everything about @mention autocomplete EXCEPT where the caret is.
 *
 * Lifted out of `MentionField` unchanged so that the plain-text box and both
 * rich editors share one implementation. `mentionKeys.ts` states the rule this
 * follows: *"Only the key PLUMBING is split by platform. The list, its ordering
 * and which row is highlighted all stay in one place… two boxes doing the same
 * thing is how one of them quietly stops doing it."* Everything here is the
 * "one place"; the caller supplies only `onInsert` and `onRefocus`.
 *
 * The behaviours below were each paid for once and must not be re-derived:
 *  - a ref beside the highlight state, because held arrow keys repeat faster
 *    than React renders and two moves would otherwise land on the same value;
 *  - reset-and-scroll-to-top when the query narrows, or the mounted list sits
 *    scrolled past the end showing blank space;
 *  - `dismissedFor`, so Escape closes the popover until the query actually
 *    changes rather than reopening on the next keystroke;
 *  - a blur grace period, because web fires mousedown -> blur -> click and
 *    closing on blur destroys the row mid-click.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ScrollView } from 'react-native';
import { mentionSuggestions, type MentionCandidate } from '@sabeel/shared';

/** Web fires mousedown -> blur -> click; closing on blur eats the click. */
const BLUR_GRACE_MS = 200;

export interface MentionPolicy {
  open: boolean;
  suggestions: MentionCandidate[];
  index: number;
  listRef: React.RefObject<ScrollView | null>;
  accept: (candidate: MentionCandidate) => void;
  move: (delta: number) => void;
  dismiss: () => void;
  onFocus: () => void;
  onBlur: () => void;
  /** Call when a pick must not be treated as leaving the field. */
  cancelPendingBlur: () => void;
}

export function useMentionPolicy({
  query,
  candidates,
  prioritiseUids,
  rowPitch,
  onInsert,
  onRefocus,
}: {
  /** The text after `@`, or null when no mention is being typed. */
  query: string | null;
  candidates: readonly MentionCandidate[];
  prioritiseUids?: readonly string[];
  /** Measured row height + gap, so scrolling lands on a row rather than near one. */
  rowPitch: number;
  onInsert: (candidate: MentionCandidate) => void;
  onRefocus: () => void;
}): MentionPolicy {
  const listRef = useRef<ScrollView | null>(null);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [focused, setFocused] = useState(false);
  const [dismissedFor, setDismissedFor] = useState<string | null>(null);
  const [highlighted, setHighlighted] = useState(0);
  const highlightRef = useRef(0);

  const suggestions = useMemo(
    () =>
      query === null
        ? []
        : mentionSuggestions(query, candidates, { prioritise: prioritiseUids }),
    [query, candidates, prioritiseUids],
  );

  const cancelPendingBlur = useCallback(() => {
    if (blurTimer.current !== null) {
      clearTimeout(blurTimer.current);
      blurTimer.current = null;
    }
  }, []);
  useEffect(() => cancelPendingBlur, [cancelPendingBlur]);

  const open = focused && suggestions.length > 0 && query !== dismissedFor;

  useEffect(() => {
    setHighlighted(0);
    highlightRef.current = 0;
    listRef.current?.scrollTo({ y: 0, animated: false });
  }, [query]);

  // Belt and braces: a state reset is asynchronous, so a render can still land
  // with the previous index against a shorter list.
  const index = Math.min(highlighted, Math.max(0, suggestions.length - 1));
  highlightRef.current = index;

  const accept = useCallback(
    (candidate: MentionCandidate) => {
      onInsert(candidate);
      setDismissedFor(null);
      // Picking BLURS the box, by click or by tab-then-enter, and without this
      // you cannot carry on typing — which makes autocomplete a trap.
      setTimeout(onRefocus, 0);
    },
    [onInsert, onRefocus],
  );

  const move = useCallback(
    (delta: number) => {
      if (suggestions.length === 0) return;
      const next =
        (highlightRef.current + delta + suggestions.length) % suggestions.length;
      highlightRef.current = next;
      setHighlighted(next);
      listRef.current?.scrollTo({ y: next * rowPitch, animated: false });
    },
    [suggestions.length, rowPitch],
  );

  const dismiss = useCallback(() => setDismissedFor(query), [query]);

  const onFocus = useCallback(() => {
    cancelPendingBlur();
    setFocused(true);
  }, [cancelPendingBlur]);

  const onBlur = useCallback(() => {
    cancelPendingBlur();
    blurTimer.current = setTimeout(() => setFocused(false), BLUR_GRACE_MS);
  }, [cancelPendingBlur]);

  return {
    open,
    suggestions,
    index,
    listRef,
    accept,
    move,
    dismiss,
    onFocus,
    onBlur,
    cancelPendingBlur,
  };
}
