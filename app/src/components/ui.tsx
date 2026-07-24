/**
 * Themed primitives. Screens compose these rather than styling from scratch, so
 * styling stays coherent and no screen ever needs a color literal.
 */
import {
  Children,
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
import { readableInkOn, type Priority } from '@sabeel/shared';
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
import {
  CONTENT_MAX_WIDTH,
  GRID_CARD_MIN_WIDTH,
  LIST_MAX_WIDTH,
  READ_MAX_WIDTH,
  useLayout,
} from '../theme/layout';
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
   * How wide the content may grow on a WIDE screen (ignored on a phone, where the
   * column is the whole screen). Capping-and-centring is what stops a phone-first
   * layout from looking like a phone screen stretched sideways on a desktop:
   *  - `read`    a narrow reading column — text, forms, card detail, settings.
   *  - `content` the default mid column — simple pages.
   *  - `list`    a wide column for card GRIDS that should fill a laptop/desktop.
   *  - `full`    no cap — the board, which uses every pixel.
   */
  width?: 'read' | 'content' | 'list' | 'full';
}) {
  const t = useTheme();
  const error = useListenerError();
  const { isWide } = useLayout();
  const claimedEdges = useContext(NavClaimedEdgesContext);
  const edges = ALL_EDGES.filter((e) => !claimedEdges.includes(e));

  // Cap and centre on wide screens; on a phone the column IS the screen, so a
  // maxWidth there would just add dead margin.
  const maxWidth =
    !isWide || width === 'full'
      ? undefined
      : width === 'read'
        ? READ_MAX_WIDTH
        : width === 'list'
          ? LIST_MAX_WIDTH
          : CONTENT_MAX_WIDTH;

  // `fill` when not scrolling is load-bearing, not decoration. This wrapper sits
  // between the flex:1 container and the screen's content, and a View with no
  // flex sizes to its CONTENT — so on native a child with flex:1 (the board's
  // pager) collapsed to zero height and rendered nothing at all. Header and
  // pager controls still drew, because they size to their content, which made it
  // look like the column was missing rather than the layout being broken.
  // react-native-web resolves the same tree differently, so web looked correct
  // throughout. Verified on a device 2026-07-19.
  const body = (
    <View style={[!scroll && styles.fill, maxWidth ? [styles.capped, { maxWidth }] : null]}>
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

/**
 * A small colored badge: a word on a fill of `color`, with the ink chosen for
 * contrast so it reads on ANY color. The one "text over an arbitrary color"
 * primitive — used for priority and labels (which is why the contrast is
 * computed, not hardcoded white).
 */
export function ColorBadge({ color, label }: { color: string; label: string }) {
  const t = useTheme();
  const ink = readableInkOn(color, t.text.inverse, t.text.primary) === 'light'
    ? t.text.inverse
    : t.text.primary;
  return (
    <View style={[styles.badge, { backgroundColor: color }]}>
      <Text style={[type.caption, styles.badgeText, { color: ink }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/** A card's priority as a badge. `none` renders nothing — an unset priority is
 *  not worth a chip. */
export function PriorityBadge({ priority }: { priority: Priority }) {
  const t = useTheme();
  if (priority === 'none') return null;
  const label = priority[0].toUpperCase() + priority.slice(1);
  return <ColorBadge color={t.priority[priority]} label={label} />;
}

/**
 * An assignee as a neutral name chip — deliberately NOT a colored badge, so
 * people don't read as labels. A small initials disc anchors who it is.
 */
export function AssigneeChip({ name }: { name: string }) {
  const t = useTheme();
  const initials =
    name
      .trim()
      .split(/\s+/)
      .map((w) => w[0])
      .slice(0, 2)
      .join('')
      .toUpperCase() || '?';
  return (
    <View style={[styles.assignee, { backgroundColor: t.bg.inset, borderColor: t.border.subtle }]}>
      <View style={[styles.assigneeDisc, { backgroundColor: t.bg.surface }]}>
        <Text style={[styles.assigneeInitials, { color: t.text.secondary }]}>{initials}</Text>
      </View>
      <Text style={[type.caption, { color: t.text.secondary }]} numberOfLines={1}>
        {name}
      </Text>
    </View>
  );
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

/**
 * A responsive grid for card-like list items (boards, search results). On a wide
 * screen the cards flow into as many columns as fit (each ~GRID_CARD_MIN_WIDTH,
 * capped so a lone card on the last row does not stretch); on a phone it is a
 * single full-width column. Give it plain cards as children — it wraps each.
 */
export function CardGrid({ children }: { children: ReactNode }) {
  const { isWide } = useLayout();
  return (
    <View style={styles.grid}>
      {Children.map(children, (child) =>
        child == null || child === false ? null : (
          <View style={isWide ? styles.gridItemWide : styles.gridItemNarrow}>
            {child}
          </View>
        ),
      )}
    </View>
  );
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled,
  busy,
  block,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  busy?: boolean;
  /** Force full width even on wide screens. For the rare screen whose primary
   *  action should span its container — e.g. the sign-in screen. */
  block?: boolean;
}) {
  const t = useTheme();
  const { isWide } = useLayout();
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
        // Full-width is a good primary-action shape on a phone, but on a desktop
        // it stretches into a bar; there, size to the label and sit left. In a
        // Row the button is already content-width, so this only affects the
        // stretched column-child case. `block` opts back into full width for the
        // rare screen (sign-in) whose action should span its container.
        { alignSelf: block || !isWide ? 'stretch' : 'flex-start' },
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
  disabled,
}: {
  icon: MaterialIconName;
  label: string;
  onPress: () => void;
  danger?: boolean;
  /** Disable while a write it triggers is in flight, so it cannot re-fire. */
  disabled?: boolean;
}) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      onPress={onPress}
      disabled={disabled}
      hitSlop={{ top: 14, bottom: 14, left: 12, right: 12 }}
      style={({ pressed }) => [
        styles.action,
        disabled && { opacity: 0.4 },
        pressed && { opacity: 0.6 },
      ]}
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
  /** Cap input length so a write never exceeds what firestore.rules allows. */
  maxLength?: number;
}>(function TextField(
  { value, onChangeText, placeholder, onSubmit, multiline, autoFocus, label, maxLength },
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
      maxLength={maxLength}
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
  /** Centred column on wide screens; the caller supplies the maxWidth. */
  capped: {
    width: '100%',
    alignSelf: 'center',
    gap: space.sm,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  // Grow to fill the row but stay near the target width so a lone last card
  // does not stretch across the whole grid.
  gridItemWide: { flexGrow: 1, flexBasis: GRID_CARD_MIN_WIDTH, maxWidth: 380 },
  gridItemNarrow: { width: '100%' },
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
  badge: {
    borderRadius: radius.pill,
    paddingHorizontal: space.sm,
    paddingVertical: 2,
    alignSelf: 'flex-start',
  },
  badgeText: { fontWeight: '600' },
  assignee: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.pill,
    paddingLeft: 2,
    paddingRight: space.sm,
    paddingVertical: 2,
    alignSelf: 'flex-start',
  },
  assigneeDisc: {
    width: 18,
    height: 18,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  assigneeInitials: { fontSize: 9, fontWeight: '700' },
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
