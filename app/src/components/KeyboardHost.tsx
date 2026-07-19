import type { ReactNode } from 'react';
import { KeyboardProvider } from 'react-native-keyboard-controller';

/**
 * Provides IME inset tracking to the whole tree — NATIVE (web sibling:
 * KeyboardHost.web.tsx).
 *
 * Must wrap everything: it is what feeds WindowInsets to KeyboardScroll.
 * Without it those scroll views silently behave like ordinary ones, which is a
 * failure mode with no error message.
 */
export function KeyboardHost({ children }: { children: ReactNode }) {
  return <KeyboardProvider>{children}</KeyboardProvider>;
}
