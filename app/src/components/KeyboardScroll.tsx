import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';

/**
 * Scrolling container that keeps the focused input clear of the keyboard —
 * NATIVE (web sibling: KeyboardScroll.web.tsx).
 *
 * `react-native-keyboard-controller` tracks the IME through **WindowInsets**,
 * which is the only mechanism that works under edge-to-edge
 * (`edgeToEdgeEnabled=true`, the default here). Under edge-to-edge:
 *
 *  - `android:windowSoftInputMode="adjustResize"` stops shrinking the window, so
 *    the keyboard simply OVERLAYS the content;
 *  - React Native's own `Keyboard` events do not fire, so a hand-rolled
 *    listener that adds bottom padding silently does nothing at all.
 *
 * That second point is why this is a native dependency rather than a few lines
 * of our own: the DIY version looks reasonable, compiles, and has no effect.
 */
export function KeyboardScroll({
  children,
  contentContainerStyle,
  bottomOffset,
}: {
  children: ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
  bottomOffset?: number;
}) {
  return (
    <KeyboardAwareScrollView
      contentContainerStyle={contentContainerStyle}
      bottomOffset={bottomOffset}
      // Without this the first tap while the keyboard is up only dismisses the
      // keyboard — the button under your finger never fires, so every submit
      // takes two taps and feels broken.
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </KeyboardAwareScrollView>
  );
}
