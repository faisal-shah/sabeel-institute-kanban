import type { ReactNode } from 'react';

/**
 * WEB no-op (native sibling: KeyboardSticky.tsx).
 *
 * Browsers shrink the visual viewport when the on-screen keyboard appears and
 * keep the focused element in view, so a pinned composer needs no help here.
 */
export function KeyboardSticky({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
