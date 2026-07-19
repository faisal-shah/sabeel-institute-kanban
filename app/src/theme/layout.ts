import { Platform, useWindowDimensions } from 'react-native';

/**
 * Layout decisions are driven by AVAILABLE WIDTH, not by platform.
 *
 * This was originally got wrong: the board was split into a web component and a
 * native component, which meant a tablet running the Android app got the phone's
 * swipe layout despite having room for four columns, and a phone browser got the
 * desktop drag board on a 380px screen. "Android" is not a synonym for "small",
 * and "web" is not a synonym for "large".
 *
 * Platform still decides one thing — whether HTML5 drag-and-drop exists — but
 * that is a CAPABILITY, layered on top of a layout chosen by width.
 */

/**
 * 768px — the classic tablet-portrait width.
 *
 * The wide board scrolls horizontally, so it does not need room for every
 * column, only enough for TWO to be useful side by side: 2 x 300px plus gutters
 * is about 640. Setting this at 900 (the three-column width) was too
 * conservative and left an 820px tablet showing one column at a time with most
 * of the screen empty.
 */
export const WIDE_BREAKPOINT = 768;

/** Where a single column of forms and lists stops being comfortable to read. */
export const CONTENT_MAX_WIDTH = 840;

export interface Layout {
  width: number;
  height: number;
  /** Enough room for a multi-column board: desktop, or a tablet in landscape. */
  isWide: boolean;
  /** One column at a time: phones, and narrow browser windows. */
  isCompact: boolean;
  /**
   * Whether HTML5 drag-and-drop is available. True only on the web — React
   * Native has no equivalent, so a wide NATIVE board (a tablet) offers the same
   * explicit "Move to…" affordance the phone uses.
   */
  canDragAndDrop: boolean;
}

export function useLayout(): Layout {
  const { width, height } = useWindowDimensions();
  const isWide = width >= WIDE_BREAKPOINT;
  return {
    width,
    height,
    isWide,
    isCompact: !isWide,
    canDragAndDrop: Platform.OS === 'web',
  };
}
