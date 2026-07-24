/**
 * Pick a legible ink for text drawn on a colored background — so priority and
 * label badges stay readable on any color without hand-picking a foreground per
 * color. Based on WCAG relative luminance / contrast ratio.
 */

/** WCAG relative luminance of an `#rrggbb` color, 0 (black) … 1 (white). */
export function relativeLuminance(hex: string): number {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return 0;
  const n = parseInt(m[1], 16);
  const lin = [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

/** WCAG contrast ratio (≥ 1) between two luminances. */
function contrastRatio(a: number, b: number): number {
  const hi = Math.max(a, b);
  const lo = Math.min(a, b);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * `'light'` or `'dark'` — whichever candidate ink contrasts better against `bg`.
 * The caller maps the result to its own tokens (e.g. ivory vs dark ink). Pass the
 * real ink colors for an exact choice; the white/black defaults give a sensible
 * generic answer.
 */
export function readableInkOn(
  bg: string,
  lightInk = '#ffffff',
  darkInk = '#000000',
): 'light' | 'dark' {
  const bgL = relativeLuminance(bg);
  const light = contrastRatio(bgL, relativeLuminance(lightInk));
  const dark = contrastRatio(bgL, relativeLuminance(darkInk));
  return dark > light ? 'dark' : 'light';
}
