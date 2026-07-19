import type { ReactNode } from 'react';
import { ScrollView, type StyleProp, type ViewStyle } from 'react-native';

/**
 * Scrolling container — WEB (native sibling: KeyboardScroll.tsx).
 *
 * A plain ScrollView, deliberately. Browsers already scroll a focused input into
 * view when the on-screen keyboard appears, and they resize the visual viewport
 * themselves, so there is nothing to reimplement.
 *
 * `react-native-keyboard-controller` is NOT used here: it ships no web
 * implementation and depends on native WindowInsets, so importing it on web
 * risks breaking the whole page for a problem the browser has already solved.
 * `bottomOffset` is accepted and ignored to keep one call signature.
 */
export function KeyboardScroll({
  children,
  contentContainerStyle,
}: {
  children: ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
  bottomOffset?: number;
}) {
  return (
    <ScrollView
      contentContainerStyle={contentContainerStyle}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  );
}
