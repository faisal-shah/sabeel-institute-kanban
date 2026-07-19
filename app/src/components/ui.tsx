/**
 * Themed primitives. Screens compose these rather than styling from scratch, so
 * light/dark stays coherent and no screen ever needs a color literal.
 */
import { forwardRef, useEffect, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { radius, space, type, useTheme } from '../theme';
import { CONTENT_MAX_WIDTH, useLayout } from '../theme/layout';
import { useListenerError } from '../liveQuery';

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
  const keyboard = useKeyboardHeight();

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
    <SafeAreaView style={[styles.fill, { backgroundColor: t.bg.canvas }]}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            // Room to scroll the focused field clear of the keyboard. The
            // manifest asks for adjustResize, but under edge-to-edge the window
            // no longer shrinks, so the keyboard OVERLAYS the content: the
            // comment box stayed visible while its Send button was sliced in
            // half, with no way to scroll further.
            keyboard > 0 && { paddingBottom: keyboard + space.xl },
          ]}
          // Without this the first tap while the keyboard is up only dismisses
          // the keyboard — the button under your finger never fires, so every
          // submit takes two taps and feels broken.
          keyboardShouldPersistTaps="handled"
        >
          {body}
        </ScrollView>
      ) : (
        <View style={styles.flexContent}>{body}</View>
      )}
    </SafeAreaView>
  );
}

/**
 * Height of the on-screen keyboard, or 0.
 *
 * Screens add this as bottom padding so a focused field can always be scrolled
 * above the keyboard. `keyboardDidShow` rather than `WillShow`: the Will events
 * do not fire on Android.
 */
function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', (e) =>
      setHeight(e.endCoordinates.height),
    );
    const hide = Keyboard.addListener('keyboardDidHide', () => setHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return height;
}

export function Title({ children }: { children: ReactNode }) {
  const t = useTheme();
  return <Text style={[type.title, { color: t.text.primary }]}>{children}</Text>;
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

export function Caption({ children }: { children: ReactNode }) {
  const t = useTheme();
  return <Text style={[type.caption, { color: t.text.muted }]}>{children}</Text>;
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
export function Pill({
  label,
  tone = 'neutral',
}: {
  label: string;
  tone?: 'neutral' | 'good' | 'warn' | 'bad' | 'accent';
}) {
  const t = useTheme();
  const color =
    tone === 'good'
      ? t.feedback.success
      : tone === 'warn'
        ? t.feedback.warning
        : tone === 'bad'
          ? t.feedback.danger
          : tone === 'accent'
            ? t.accent.base
            : t.text.muted;

  return (
    <View style={[styles.pill, { borderColor: color }]}>
      <Text style={[type.caption, { color }]}>{label}</Text>
    </View>
  );
}

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
