import type { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Body, Button, Caption, Hint } from './ui';
import { radius, space, useTheme } from '../theme';

/**
 * A centred, size-bounded dialog.
 *
 * Replaces an absolutely-positioned panel pinned to the bottom of the screen,
 * which could not be fully seen on a short viewport: its content ran past the
 * bottom edge with no way to reach it, and enlarging the window did not reliably
 * help because the panel grew with its content.
 *
 * The rules that fixes are worth stating, because they apply to every overlay:
 *
 *  - Bound the height (a fraction of the viewport) and scroll INSIDE it, so the
 *    dialog can never be taller than the screen however many options it has.
 *  - Centre it rather than pinning to an edge, so a keyboard rising from the
 *    bottom cannot cover it.
 *  - Give it a dismissing backdrop, so it is never possible to get stuck behind.
 *
 * Uses RN's Modal, which renders in a top layer on both platforms. An
 * absolutely-positioned View is still subject to its parent's clipping and
 * stacking context, which was the other half of why the old panel misbehaved.
 */
export function Sheet({
  visible,
  title,
  onClose,
  children,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const t = useTheme();
  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable
        style={[styles.backdrop, { backgroundColor: t.effect.overlay }]}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close"
      >
        {/* Absorbs taps so a press inside does not dismiss via the backdrop. */}
        <Pressable
          style={[
            styles.panel,
            { backgroundColor: t.bg.raised, borderColor: t.border.strong },
          ]}
          onPress={() => {}}
        >
          <Body>{title}</Body>
          <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
            {children}
          </ScrollView>
          <Button label="Cancel" variant="secondary" onPress={onClose} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** One choice inside a Sheet — together these give the compact "dropdown" shape. */
export function SheetOption({
  label,
  detail,
  selected,
  onPress,
}: {
  label: string;
  detail?: string;
  selected?: boolean;
  onPress: () => void;
}) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={selected}
      onPress={onPress}
      style={({ pressed }) => [
        styles.option,
        {
          backgroundColor: selected
            ? t.bg.accentSoft
            : pressed
              ? t.bg.inset
              : t.bg.surface,
          borderColor: selected ? t.accent.base : t.border.subtle,
        },
      ]}
    >
      <View style={styles.optionText}>
        <Body>{label}</Body>
        {selected ? <Caption>current</Caption> : null}
        {detail ? <Hint>{detail}</Hint> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.lg,
  },
  panel: {
    width: '100%',
    maxWidth: 420,
    // Never taller than the viewport, whatever the content.
    maxHeight: '80%',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    padding: space.lg,
    gap: space.sm,
  },
  body: { flexGrow: 0 },
  bodyContent: { gap: space.sm },
  option: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.sm,
    padding: space.md,
    minHeight: 44,
    justifyContent: 'center',
  },
  optionText: { gap: 2 },
});
