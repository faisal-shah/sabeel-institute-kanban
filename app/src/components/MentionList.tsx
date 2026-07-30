/**
 * The @mention popover, shared by the plain-text box and both rich editors.
 *
 * Every property here was learned on a device and must survive any move:
 *  - `position: absolute` above the field. Inline-below hid behind the
 *    keyboard; inline-above pushed the field down without re-triggering a
 *    scroll. Absolute takes no layout, so the 96px keyboard budget is unspent.
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
import { Body, Hint } from './ui';
import { radius, space, useTheme } from '../theme';

const ROW_HEIGHT = 60;
const ROW_GAP = space.xs;
export const ROW_PITCH = ROW_HEIGHT + ROW_GAP;
const VISIBLE_ROWS = 4;
const LIST_MAX_HEIGHT = ROW_PITCH * VISIBLE_ROWS;

export function MentionList({
  suggestions,
  index,
  listRef,
  onPick,
  onMeasureRow,
}: {
  suggestions: readonly MentionCandidate[];
  index: number;
  listRef: React.RefObject<ScrollView | null>;
  onPick: (c: MentionCandidate) => void;
  onMeasureRow: (pitch: number) => void;
}) {
  const t = useTheme();
  return (
    <View
      style={[
        styles.popover,
        { backgroundColor: t.bg.surface, borderColor: t.border.subtle },
      ]}
    >
      <Hint>
        Mention
        {suggestions.length > VISIBLE_ROWS ? ` — ${suggestions.length} people` : ''}
      </Hint>
      <ScrollView
        ref={listRef}
        style={styles.list}
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
    bottom: '100%',
    left: 0,
    right: 0,
    marginBottom: space.xs,
    padding: space.sm,
    gap: space.xs,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    zIndex: 10,
    elevation: 8,
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
