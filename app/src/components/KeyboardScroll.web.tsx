import { useImperativeHandle, useRef, type ReactNode, type Ref } from 'react';
import { ScrollView, type StyleProp, type ViewStyle } from 'react-native';
import type { Scroller } from './KeyboardScroll';

export type { Scroller };

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
  scrollRef,
}: {
  children: ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
  bottomOffset?: number;
  /** For a screen that has to move the view itself — see `Screen`. */
  scrollRef?: Ref<Scroller>;
}) {
  const inner = useRef<ScrollView>(null);
  useImperativeHandle(scrollRef, () => ({
    scrollTo: (options) => inner.current?.scrollTo(options),
  }));

  return (
    <ScrollView
      ref={inner}
      contentContainerStyle={contentContainerStyle}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  );
}
