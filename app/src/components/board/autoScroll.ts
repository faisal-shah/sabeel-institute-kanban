import { canScrollBy, scrollDeltaFor } from '@sabeel/shared';

/**
 * DOM driver for edge auto-scrolling during a drag. The arithmetic lives in
 * `@sabeel/shared` and is tested there.
 */

export interface AutoScrollTarget {
  el: HTMLElement;
  axis: 'x' | 'y';
}

export function createAutoScroller() {
  let frame: number | null = null;
  let targets: AutoScrollTarget[] = [];
  let point: { x: number; y: number } | null = null;

  function tick() {
    frame = null;
    if (!point) return;

    let scrolled = false;
    for (const { el, axis } of targets) {
      const rect = el.getBoundingClientRect();
      const delta =
        axis === 'x'
          ? scrollDeltaFor(point.x, { start: rect.left, end: rect.right })
          : scrollDeltaFor(point.y, { start: rect.top, end: rect.bottom });

      const metrics =
        axis === 'x'
          ? {
              scrollPos: el.scrollLeft,
              scrollSize: el.scrollWidth,
              clientSize: el.clientWidth,
            }
          : {
              scrollPos: el.scrollTop,
              scrollSize: el.scrollHeight,
              clientSize: el.clientHeight,
            };

      if (canScrollBy(metrics, delta)) {
        if (axis === 'x') el.scrollLeft += delta;
        else el.scrollTop += delta;
        scrolled = true;
      }
    }

    // Keep looping only while something is actually moving — otherwise a drag
    // held anywhere would spin a rAF loop for its whole duration.
    if (scrolled) frame = requestAnimationFrame(tick);
  }

  return {
    /**
     * Feed from `dragover`. A rAF loop rather than scrolling inline, because
     * `dragover` only fires when the pointer MOVES — and holding still at the
     * edge is exactly what someone does while waiting for the board to scroll.
     */
    update(x: number, y: number, nextTargets: AutoScrollTarget[]) {
      point = { x, y };
      targets = nextTargets;
      if (frame === null) frame = requestAnimationFrame(tick);
    },
    stop() {
      point = null;
      targets = [];
      if (frame !== null) {
        cancelAnimationFrame(frame);
        frame = null;
      }
    },
  };
}
