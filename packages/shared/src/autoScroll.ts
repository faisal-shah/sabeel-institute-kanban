/**
 * Edge auto-scroll arithmetic, kept here so it can be tested without a DOM.
 *
 * The HTML5 drag-and-drop API does not scroll a container when the pointer
 * reaches its edge. Without auto-scroll a card can only be dropped somewhere
 * already visible, so on a board with several columns — or a column of twenty
 * cards — the destination is simply unreachable.
 *
 * The DOM driver lives in app/src/components/board/autoScroll.ts.
 */

/** Distance from an edge at which scrolling begins. */
export const EDGE_ZONE_PX = 72;

/** Fastest scroll, in pixels per animation frame, reached at the very edge. */
export const MAX_SPEED_PX = 22;

export interface ScrollBounds {
  start: number;
  end: number;
}

export interface ScrollMetrics {
  scrollPos: number;
  scrollSize: number;
  clientSize: number;
}

/**
 * Pixels to scroll this frame along one axis. Negative scrolls toward the start.
 *
 * Speed ramps with proximity, so nudging near the edge is gentle while holding
 * at the edge is fast. Past the edge entirely — the pointer dragged outside the
 * container — it clamps to full speed rather than reversing sign.
 */
export function scrollDeltaFor(pointer: number, bounds: ScrollBounds): number {
  const fromStart = pointer - bounds.start;
  const fromEnd = bounds.end - pointer;

  // A container narrower than two edge zones would otherwise want to scroll both
  // ways at once. Nearest edge wins.
  if (fromStart < fromEnd) {
    if (fromStart >= EDGE_ZONE_PX) return 0;
    const t = Math.min(1, Math.max(0, 1 - fromStart / EDGE_ZONE_PX));
    return -Math.ceil(t * MAX_SPEED_PX);
  }

  if (fromEnd >= EDGE_ZONE_PX) return 0;
  const t = Math.min(1, Math.max(0, 1 - fromEnd / EDGE_ZONE_PX));
  return Math.ceil(t * MAX_SPEED_PX);
}

/**
 * Whether the container can still move that way. Without this the loop keeps
 * running at a scroll limit, burning frames for the whole drag.
 */
export function canScrollBy(m: ScrollMetrics, delta: number): boolean {
  if (delta === 0) return false;
  const max = m.scrollSize - m.clientSize;
  if (max <= 0) return false;
  return delta < 0 ? m.scrollPos > 0 : m.scrollPos < max;
}
