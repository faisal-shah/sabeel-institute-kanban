import { describe, it, expect } from 'vitest';
import {
  EDGE_ZONE_PX,
  MAX_SPEED_PX,
  canScrollBy,
  scrollDeltaFor,
} from '../src/autoScroll';

// A container spanning 100..900 on screen.
const bounds = { start: 100, end: 900 };

describe('scrollDeltaFor', () => {
  it('does nothing in the middle', () => {
    expect(scrollDeltaFor(500, bounds)).toBe(0);
  });

  it('does nothing just outside the edge zone', () => {
    expect(scrollDeltaFor(100 + EDGE_ZONE_PX, bounds)).toBe(0);
    expect(scrollDeltaFor(900 - EDGE_ZONE_PX, bounds)).toBe(0);
  });

  it('scrolls toward the start near the start edge', () => {
    expect(scrollDeltaFor(110, bounds)).toBeLessThan(0);
  });

  it('scrolls toward the end near the end edge', () => {
    expect(scrollDeltaFor(890, bounds)).toBeGreaterThan(0);
  });

  it('ramps with proximity — closer means faster', () => {
    const far = Math.abs(scrollDeltaFor(160, bounds));
    const near = Math.abs(scrollDeltaFor(105, bounds));
    expect(near).toBeGreaterThan(far);
  });

  it('reaches full speed at the edge', () => {
    expect(scrollDeltaFor(100, bounds)).toBe(-MAX_SPEED_PX);
    expect(scrollDeltaFor(900, bounds)).toBe(MAX_SPEED_PX);
  });

  it('CLAMPS past the edge rather than reversing', () => {
    // Dragging outside the container must keep scrolling that way, not flip
    // direction — which is what an unclamped ramp would do.
    expect(scrollDeltaFor(20, bounds)).toBe(-MAX_SPEED_PX);
    expect(scrollDeltaFor(2000, bounds)).toBe(MAX_SPEED_PX);
  });

  it('picks the NEAREST edge in a container narrower than two edge zones', () => {
    // Otherwise both edges qualify and the direction depends on evaluation
    // order, which would look like a random jitter.
    const tiny = { start: 0, end: EDGE_ZONE_PX };
    expect(scrollDeltaFor(5, tiny)).toBeLessThan(0);
    expect(scrollDeltaFor(EDGE_ZONE_PX - 5, tiny)).toBeGreaterThan(0);
  });

  it('is symmetric about the centre', () => {
    expect(Math.abs(scrollDeltaFor(110, bounds))).toBe(
      Math.abs(scrollDeltaFor(890, bounds)),
    );
  });
});

describe('canScrollBy', () => {
  const mid = { scrollPos: 200, scrollSize: 2000, clientSize: 800 };

  it('allows scrolling either way from the middle', () => {
    expect(canScrollBy(mid, -10)).toBe(true);
    expect(canScrollBy(mid, 10)).toBe(true);
  });

  it('refuses to scroll before the start', () => {
    expect(canScrollBy({ ...mid, scrollPos: 0 }, -10)).toBe(false);
    expect(canScrollBy({ ...mid, scrollPos: 0 }, 10)).toBe(true);
  });

  it('refuses to scroll past the end', () => {
    const atEnd = { ...mid, scrollPos: 1200 };
    expect(canScrollBy(atEnd, 10)).toBe(false);
    expect(canScrollBy(atEnd, -10)).toBe(true);
  });

  it('refuses when there is nothing to scroll', () => {
    // Stops the animation loop spinning for a whole drag on a short column.
    expect(canScrollBy({ scrollPos: 0, scrollSize: 500, clientSize: 800 }, 10)).toBe(
      false,
    );
  });

  it('refuses a zero delta', () => {
    expect(canScrollBy(mid, 0)).toBe(false);
  });
});
