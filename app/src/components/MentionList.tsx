/**
 * The @mention popover, shared by both rich editors.
 *
 * WHERE it goes comes from `anchor`, computed by `mentionAnchor.ts` from a caret
 * the platform measured. `anchor === null` is the fallback for a surface that
 * cannot report one: the old placement, above the whole field, full width.
 *
 * WHO DRAWS IT depends on the same thing. With an anchor it is rendered by
 * `MentionOverlay` as the last child of the app root, in screen coordinates,
 * because no zIndex inside the editor can lift it clear — every
 * react-native-web View is a stacking context, so a later SECTION of the card
 * drew over the third name even after the editor was lifted over its own
 * siblings. Without an anchor the editor still renders it inline, where
 * `bottom: 100%` is the only thing that means anything.
 *
 * Every property here was learned on a device and must survive any move:
 *  - `position: absolute`. Inline-below hid behind the keyboard; inline-above
 *    pushed the field down without re-triggering a scroll. Absolute takes no
 *    layout, so the 96px keyboard budget is unspent.
 *  - `zIndex` AND `elevation`: the first is web/iOS, the second is Android.
 *  - `keyboardShouldPersistTaps` is NOT inherited from `Screen`'s scroller.
 *    Without it the first tap on a name only dismisses the keyboard and the row
 *    looks dead.
 *  - the row PITCH is measured from the first row rather than assumed, because
 *    scrolling by an assumed height lands between rows.
 *  - `Hint`, not `Caption`: both are caption-sized, but `Caption` is
 *    `text.muted` at 2.34:1 here, which fails AA and even the 3:1 non-text
 *    floor. `Hint` is `text.secondary` at 5.10:1.
 */
import { ScrollView, StyleSheet, Pressable, View } from 'react-native';
import { handleFor, type MentionCandidate } from '@sabeel/shared';
import type { MentionAnchor } from './mentionAnchor';
import { Body, Hint } from './ui';
import { radius, space, useTheme } from '../theme';

const ROW_HEIGHT = 60;
const ROW_GAP = space.xs;
export const ROW_PITCH = ROW_HEIGHT + ROW_GAP;
const VISIBLE_ROWS = 4;
const LIST_MAX_HEIGHT = ROW_PITCH * VISIBLE_ROWS;
/**
 * Everything in the popover that is not the scrolling list: its padding, the
 * gap, and the "Mention" caption. Subtracted so the list inside honours the
 * height the anchor measured — Yoga defaults `flexShrink` to 0, so a taller
 * child would simply overflow the box rather than give.
 */
const CHROME = space.sm * 2 + space.xs + 18;

/** How tall the whole popover would like to be, before room is considered. */
export const MENTION_DESIRED_HEIGHT = LIST_MAX_HEIGHT + CHROME;

export interface MentionListProps {
  suggestions: readonly MentionCandidate[];
  index: number;
  listRef: React.RefObject<ScrollView | null>;
  onPick: (c: MentionCandidate) => void;
  onMeasureRow: (pitch: number) => void;
  /**
   * Null when the platform could not measure a caret — see the header.
   *
   * When it is NOT null the list is drawn by `MentionOverlay` at the app root,
   * so these are SCREEN coordinates. When it is null the editor renders this
   * component inline and the old above-the-field placement applies.
   */
  anchor: MentionAnchor | null;
}

export function MentionList({
  suggestions,
  index,
  listRef,
  onPick,
  onMeasureRow,
  anchor,
}: MentionListProps) {
  const t = useTheme();
  return (
    <View
      // Named, because the popover is no longer the only absolutely-positioned
      // thing whose text begins with "Mention": the overlay layer wraps it and
      // matches a heuristic selector FIRST, which silently turns a placement
      // assertion into a measurement of the whole viewport.
      testID="mention-popover"
      style={[
        styles.popover,
        anchor
          ? {
              top: anchor.top,
              left: anchor.left,
              width: anchor.width,
              maxHeight: anchor.maxHeight,
            }
          : styles.aboveField,
        { backgroundColor: t.bg.surface, borderColor: t.border.subtle },
      ]}
    >
      <Hint>
        Mention
        {suggestions.length > VISIBLE_ROWS ? ` — ${suggestions.length} people` : ''}
      </Hint>
      <ScrollView
        ref={listRef}
        style={[
          styles.list,
          anchor
            ? { maxHeight: Math.max(ROW_PITCH, anchor.maxHeight - CHROME) }
            : null,
        ]}
        nestedScrollEnabled
        keyboardShouldPersistTaps="handled"
      >
        {suggestions.map((s, i) => (
          <Pressable
            key={s.uid}
            onLayout={
              i === 0
                ? (e) => onMeasureRow(e.nativeEvent.layout.height + ROW_GAP)
                : undefined
            }
            accessibilityRole="button"
            accessibilityLabel={`Mention ${s.displayName}`}
            accessibilityState={{ selected: i === index }}
            onPress={() => onPick(s)}
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
            {/* The handle, not the email: it is what actually gets typed, so
                showing anything else makes the result of picking a surprise. */}
            <Hint>@{handleFor(s.email)}</Hint>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  popover: {
    position: 'absolute',
    padding: space.sm,
    gap: space.xs,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    // zIndex is web/iOS, elevation is Android. Both, or it draws behind the
    // field on one surface and nobody notices on the other.
    zIndex: 10,
    elevation: 8,
  },
  /** No caret to anchor to: above the whole field, full width, as before. */
  aboveField: {
    bottom: '100%',
    left: 0,
    right: 0,
    marginBottom: space.xs,
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
