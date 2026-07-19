import type { ReactNode } from 'react';

/**
 * WEB no-op (native sibling: KeyboardHost.tsx).
 *
 * Browsers manage the on-screen keyboard and the visual viewport themselves, and
 * `react-native-keyboard-controller` ships no web implementation — so there is
 * nothing to provide here, and importing it would risk the page for no gain.
 */
export function KeyboardHost({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
