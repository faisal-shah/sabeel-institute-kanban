import { describe, it, expect } from 'vitest';
import { relativeLuminance, readableInkOn } from '../src/color';

// The app's real inks, used to assert the exact choice per priority/label color.
const IVORY = '#F9F2E9';
const DARK = '#3A2F28';

describe('relativeLuminance', () => {
  it('is 1 for white and 0 for black', () => {
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 5);
    expect(relativeLuminance('#000000')).toBeCloseTo(0, 5);
  });
  it('accepts hashless and mixed case, rejects junk (→0)', () => {
    expect(relativeLuminance('ffffff')).toBeCloseTo(1, 5);
    expect(relativeLuminance('#F9F2E9')).toBeGreaterThan(0.8);
    expect(relativeLuminance('nope')).toBe(0);
  });
});

describe('readableInkOn (defaults white/black)', () => {
  it('picks light ink on dark backgrounds and dark ink on light ones', () => {
    expect(readableInkOn('#000000')).toBe('light');
    expect(readableInkOn('#ffffff')).toBe('dark');
    expect(readableInkOn('#222222')).toBe('light');
  });
});

describe('readableInkOn for priority colors (ivory vs dark ink)', () => {
  const ink = (bg: string) => readableInkOn(bg, IVORY, DARK);
  it('goldenrod medium wants DARK ink; the darker priorities want ivory', () => {
    expect(ink('#4E7A43')).toBe('light'); // low — sage
    expect(ink('#B8860B')).toBe('dark'); //  medium — goldenrod (white would be unreadable)
    expect(ink('#C2611F')).toBe('light'); // high — burnt orange
    expect(ink('#A32218')).toBe('light'); // urgent — clay red
  });
  it('a light label color also resolves to dark ink', () => {
    expect(ink('#C6A15B')).toBe('dark'); // antique gold label
    expect(ink('#83114F')).toBe('light'); // dark raspberry label
  });
});
