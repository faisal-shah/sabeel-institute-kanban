import type { ReactNode } from 'react';
import { KeyboardStickyView } from 'react-native-keyboard-controller';

/**
 * Keeps a bottom-pinned composer above the keyboard — NATIVE (web sibling:
 * KeyboardSticky.web.tsx).
 *
 * The screen-level KeyboardAwareScrollView only helps screens that SCROLL. The
 * board does not: it is `Screen scroll={false}` with a horizontal pager, so its
 * "add card" field sat at the bottom and the keyboard covered the very thing
 * you had just tapped to type into.
 *
 * KeyboardStickyView translates its children up by the keyboard height, which is
 * the right primitive for a composer that is pinned rather than scrolled to.
 */
export function KeyboardSticky({ children }: { children: ReactNode }) {
  return <KeyboardStickyView>{children}</KeyboardStickyView>;
}
