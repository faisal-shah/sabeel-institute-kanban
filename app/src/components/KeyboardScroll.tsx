import { useImperativeHandle, useRef, type ReactNode, type Ref } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import {
  KeyboardAwareScrollView,
  type KeyboardAwareScrollViewRef,
} from 'react-native-keyboard-controller';

/**
 * The only thing a screen ever needs from its scroller.
 *
 * A structural handle rather than the underlying component's ref type, because
 * the two siblings do not share one: native wraps
 * `KeyboardAwareScrollView` and web a plain `ScrollView`. Bridging with
 * `useImperativeHandle` keeps one signature across both without a cast, and
 * keeps the surface to the single method that is actually used.
 */
export interface Scroller {
  scrollTo: (options: { y: number; animated?: boolean }) => void;
}

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
  scrollRef,
}: {
  children: ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
  bottomOffset?: number;
  /** For a screen that has to move the view itself — see `Screen`. */
  scrollRef?: Ref<Scroller>;
}) {
  const inner = useRef<KeyboardAwareScrollViewRef>(null);
  // `[]`, because the handle closes over a REF and so has nothing that can go
  // stale. Without it React rebuilds the object on every render of every screen
  // this wraps, which is all of them.
  useImperativeHandle(scrollRef, () => ({
    scrollTo: (options) => inner.current?.scrollTo(options),
  }), []);

  return (
    <KeyboardAwareScrollView
      ref={inner}
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
