/**
 * Themed primitives. Screens compose these rather than styling from scratch, so
 * styling stays coherent and no screen ever needs a color literal.
 */
import {
  createContext,
  forwardRef,
  useContext,
  type ComponentProps,
  type ReactNode,
} from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { KeyboardScroll } from './KeyboardScroll';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { radius, space, type, useTheme } from '../theme';

/** Any MaterialIcons glyph name, without re-listing them here. */
type MaterialIconName = ComponentProps<typeof MaterialIcons>['name'];

/**
 * Space kept below a focused field when the keyboard is up.
 *
 * Sized for a help line plus a submit button (~96), because a field is rarely
 * the last thing you interact with — the control you press after typing has to
 * be visible too.
 */
const KEYBOARD_BOTTOM_OFFSET = 96;
import { CONTENT_MAX_WIDTH, useLayout } from '../theme/layout';
import { useListenerError } from '../liveQuery';

/**
 * Safe-area edges the app-wide nav chrome has already claimed, so a Screen does
 * not inset them a second time and double the gap. `AppNav` sets this via App.tsx:
 * `['bottom']` on a phone (the bottom bar owns the gesture-pill inset) and
 * `['left']` on wide (the left rail owns that edge). Empty by default, so a
 * chrome-less screen insets all four edges itself.
 */
export const NavClaimedEdgesContext = createContext<readonly Edge[]>([]);

const ALL_EDGES: readonly Edge[] = ['top', 'right', 'bottom', 'left'];

export function Screen({
  children,
  scroll = true,
  width = 'content',
}: {
  children: ReactNode;
  scroll?: boolean;
  /**
   * `content` caps and centres the column — forms, lists and card detail become
   * unreadable when a button stretches across a 2560px monitor.
   * `full` lets the screen use every pixel, which the board needs.
   */
  width?: 'content' | 'full';
}) {
  const t = useTheme();
  const error = useListenerError();
  const { isWide } = useLayout();
  const claimedEdges = useContext(NavClaimedEdgesContext);
  const edges = ALL_EDGES.filter((e) => !claimedEdges.includes(e));

  // Only cap on wide screens: on a phone the content column IS the screen, and
  // a maxWidth there would just add dead margin.
  const capped = width === 'content' && isWide;

  // `fill` when not scrolling is load-bearing, not decoration. This wrapper sits
  // between the flex:1 container and the screen's content, and a View with no
  // flex sizes to its CONTENT — so on native a child with flex:1 (the board's
  // pager) collapsed to zero height and rendered nothing at all. Header and
  // pager controls still drew, because they size to their content, which made it
  // look like the column was missing rather than the layout being broken.
  // react-native-web resolves the same tree differently, so web looked correct
  // throughout. Verified on a device 2026-07-19.
  const body = (
    <View style={[!scroll && styles.fill, capped ? styles.capped : null]}>
      {/* Live-data errors are shown, never left to a console nobody reads. */}
      {error ? (
        <View style={[styles.banner, { backgroundColor: t.bg.dangerSoft }]}>
          <Text style={[type.caption, { color: t.text.danger }]}>{error}</Text>
        </View>
      ) : null}
      {children}
    </View>
  );

  return (
    <SafeAreaView edges={edges} style={[styles.fill, { backgroundColor: t.bg.canvas }]}>
      {scroll ? (
        <KeyboardScroll
          contentContainerStyle={styles.scrollContent}
          // Enough to clear the ACTION ROW under a field, not just the field
          // itself. At space.xxl the comment box scrolled clear while its
          // Comment button stayed sliced by the keyboard — technically the
          // focused element was visible, but the thing you press next was not,
          // so it still read as broken.
          bottomOffset={KEYBOARD_BOTTOM_OFFSET}
        >
          {body}
        </KeyboardScroll>
      ) : (
        <View style={styles.flexContent}>{body}</View>
      )}
    </SafeAreaView>
  );
}


export function Title({
  children,
  numberOfLines,
  style,
}: {
  children: ReactNode;
  /** Clamp to N lines (e.g. a long board name beside header icons). */
  numberOfLines?: number;
  style?: StyleProp<TextStyle>;
}) {
  const t = useTheme();
  return (
    <Text
      style={[type.title, { color: t.text.primary }, style]}
      numberOfLines={numberOfLines}
    >
      {children}
    </Text>
  );
}

export function Heading({ children }: { children: ReactNode }) {
  const t = useTheme();
  return (
    <Text style={[type.heading, { color: t.text.primary, marginTop: space.lg }]}>
      {children}
    </Text>
  );
}

export function Body({ children, muted }: { children: ReactNode; muted?: boolean }) {
  const t = useTheme();
  return (
    <Text style={[type.body, { color: muted ? t.text.muted : t.text.secondary }]}>
      {children}
    </Text>
  );
}

/**
 * Small METADATA — timestamps, counts, "N assigned", placeholders. Muted (true
 * taupe) on purpose: this is text you could delete without losing information,
 * which is the only job muted's ~2.7:1 contrast is legible enough for.
 *
 * If the small text CONVEYS content — an empty-state message, a field label, an
 * email, a helper sentence — it is not a caption. Use `Hint`, which is the same
 * size at a readable colour. See docs/BRAND.md / the sabeel-color-scheme skill.
 */
export function Caption({ children }: { children: ReactNode }) {
  const t = useTheme();
  return <Text style={[type.caption, { color: t.text.muted }]}>{children}</Text>;
}

/**
 * Small CONTENT — caption-sized, but `text.secondary` (~5.8:1) because it
 * carries meaning and must actually read: empty states ("No comments yet."),
 * field labels ("Title"), emails, short helper sentences. The muted/content
 * split is a brand rule, not a preference — muted body-weight content was the
 * legibility bug the colour-scheme verification pass found.
 */
export function Hint({ children }: { children: ReactNode }) {
  const t = useTheme();
  return <Text style={[type.caption, { color: t.text.secondary }]}>{children}</Text>;
}

export function Card({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: t.bg.surface, borderColor: t.border.subtle },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled,
  busy,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  busy?: boolean;
}) {
  const t = useTheme();
  const bg =
    variant === 'primary'
      ? t.accent.base
      : variant === 'danger'
        ? t.feedback.danger
        : t.bg.inset;
  const fg =
    variant === 'secondary' ? t.text.primary : t.accent.onAccent;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      disabled={disabled || busy}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, opacity: disabled ? 0.45 : pressed ? 0.8 : 1 },
      ]}
    >
      {busy ? (
        <ActivityIndicator color={fg} />
      ) : (
        <Text style={[type.label, { color: fg }]}>{label}</Text>
      )}
    </Pressable>
  );
}

/** Small status pill — pending / active / rejected / disabled, role names. */

/**
 * On/off toggle.
 *
 * Built from a Pressable rather than React Native's `Switch` because
 * react-native-web renders that one with its own Material palette and ignores
 * `thumbColor`/`trackColor` (and the RNW-specific `activeThumbColor`) — the
 * thumb came out teal, a colour that appears nowhere in the Sabeel palette.
 * Owning the two views is less code than fighting a component we cannot style,
 * and it looks identical on web and native.
 */
export function Toggle({
  value,
  onValueChange,
  disabled,
  label,
}: {
  value: boolean;
  onValueChange: (next: boolean) => void;
  disabled?: boolean;
  label: string;
}) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled: !!disabled }}
      accessibilityLabel={label}
      disabled={disabled}
      onPress={() => onValueChange(!value)}
      style={[
        styles.toggleTrack,
        {
          backgroundColor: value ? t.accent.base : t.border.strong,
          opacity: disabled ? 0.5 : 1,
          // The thumb is positioned by which end it is pushed to, so the track
          // needs no absolute layout maths and no animation to stay correct.
          justifyContent: value ? 'flex-end' : 'flex-start',
        },
      ]}
    >
      <View style={[styles.toggleThumb, { backgroundColor: t.accent.onAccent }]} />
    </Pressable>
  );
}

/**
 * A quiet icon action — an icon, not a labelled button.
 *
 * Labelled buttons cost a full row each. Comment actions, the description
 * editor and the bulk-selection bar all made the same mistake independently:
 * a screen ends up spending more height on chrome than on content. For
 * ordinary, well-known operations — edit, delete, move, archive, close — an
 * icon carries the meaning at a fraction of the space.
 *
 * `accessibilityLabel` carries the word the icon replaces, so nothing is lost
 * for screen readers, and `hitSlop` keeps the tap target finger-sized while the
 * ink stays small.
 */
export function IconAction({
  icon,
  label,
  onPress,
  danger,
}: {
  icon: MaterialIconName;
  label: string;
  onPress: () => void;
  danger?: boolean;
}) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={{ top: 14, bottom: 14, left: 12, right: 12 }}
      style={({ pressed }) => [styles.action, pressed && { opacity: 0.6 }]}
    >
      <MaterialIcons
        name={icon}
        size={18}
        color={danger ? t.text.danger : t.text.muted}
      />
    </Pressable>
  );
}

export function Row({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.row, style]}>{children}</View>;
}

export const TextField = forwardRef<TextInput, {
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  onSubmit?: () => void;
  multiline?: boolean;
  autoFocus?: boolean;
  label?: string;
}>(function TextField(
  { value, onChangeText, placeholder, onSubmit, multiline, autoFocus, label },
  ref,
) {
  const t = useTheme();
  return (
    <TextInput
      // Forwarded so callers can restore focus — picking a mention from the
      // autocomplete blurs this field, and without refocusing you cannot carry
      // on typing.
      ref={ref}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={t.text.muted}
      onSubmitEditing={onSubmit}
      multiline={multiline}
      autoFocus={autoFocus}
      accessibilityLabel={label ?? placeholder}
      style={[
        styles.input,
        multiline && styles.inputMultiline,
        {
          backgroundColor: t.bg.inset,
          color: t.text.primary,
          borderColor: t.border.subtle,
        },
      ]}
    />
  );
});

export function Spinner({ label }: { label?: string }) {
  const t = useTheme();
  return (
    <View style={styles.centre}>
      <ActivityIndicator color={t.accent.base} />
      {label ? <Caption>{label}</Caption> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  toggleTrack: {
    width: 52,
    height: 32,
    borderRadius: radius.pill,
    padding: 3,
    flexDirection: 'row',
    alignItems: 'center',
  },
  toggleThumb: { width: 26, height: 26, borderRadius: radius.pill },
  action: { paddingVertical: 2 },
  fill: { flex: 1 },
  scrollContent: { padding: space.lg, gap: space.sm },
  flexContent: { flex: 1, padding: space.lg, gap: space.sm },
  /** Centred reading column on wide screens. */
  capped: {
    width: '100%',
    maxWidth: CONTENT_MAX_WIDTH,
    alignSelf: 'center',
    gap: space.sm,
  },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    padding: space.md,
    gap: space.sm,
  },
  button: {
    borderRadius: radius.sm,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  pill: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.pill,
    paddingHorizontal: space.sm,
    paddingVertical: 2,
    alignSelf: 'flex-start',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.sm },
  banner: {
    borderRadius: radius.sm,
    padding: space.sm,
    marginBottom: space.sm,
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.sm,
    padding: space.md,
    minHeight: 44,
    ...type.body,
  },
  inputMultiline: { minHeight: 96, textAlignVertical: 'top' },
});
