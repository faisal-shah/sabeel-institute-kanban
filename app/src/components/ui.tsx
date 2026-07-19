/**
 * Themed primitives. Screens compose these rather than styling from scratch, so
 * light/dark stays coherent and no screen ever needs a color literal.
 */
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
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
import { useListenerError } from '../liveQuery';

export function Screen({
  children,
  scroll = true,
}: {
  children: ReactNode;
  scroll?: boolean;
}) {
  const t = useTheme();
  const error = useListenerError();

  const body = (
    <>
      {/* Live-data errors are shown, never left to a console nobody reads. */}
      {error ? (
        <View style={[styles.banner, { backgroundColor: t.bg.dangerSoft }]}>
          <Text style={[type.caption, { color: t.text.danger }]}>{error}</Text>
        </View>
      ) : null}
      {children}
    </>
  );

  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: t.bg.canvas }]}>
      {scroll ? (
        <ScrollView contentContainerStyle={styles.scrollContent}>{body}</ScrollView>
      ) : (
        <View style={styles.flexContent}>{body}</View>
      )}
    </SafeAreaView>
  );
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

export function Row({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.row, style]}>{children}</View>;
}

export function TextField({
  value,
  onChangeText,
  placeholder,
  onSubmit,
  multiline,
  autoFocus,
  label,
}: {
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  onSubmit?: () => void;
  multiline?: boolean;
  autoFocus?: boolean;
  label?: string;
}) {
  const t = useTheme();
  return (
    <TextInput
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
}

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
  fill: { flex: 1 },
  scrollContent: { padding: space.lg, gap: space.sm },
  flexContent: { flex: 1, padding: space.lg, gap: space.sm },
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
