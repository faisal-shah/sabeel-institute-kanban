/**
 * Raw color values. THE ONLY FILE IN THE APP ALLOWED TO CONTAIN COLOR LITERALS —
 * an ESLint rule enforces this everywhere under app/src except app/src/theme.
 *
 * These are the Sabeel Institute brand colors. The authority is
 * `docs/brand/sabeel-color-usage-guide.jpg`; `docs/BRAND.md` restates it and
 * records the two places this palette deliberately departs from it (body-text
 * contrast, and a derived dark mode). Read BRAND.md before changing anything
 * here.
 *
 *   Warm Ivory     #F9F1E7   35%   foundation — backgrounds, cards
 *   Soft Sage      #B4C4AA   30%   calm & community — alternate surfaces
 *   Dark Raspberry #8A1538   20%   brand identity — headings, buttons, links
 *   Antique Gold   #C89B3C   10%   elegance — dividers, accents, hover
 *   Mushroom Taupe #9C8B7A    5%   support — borders, captions, shadows
 *
 * Nothing outside src/theme imports this. Screens consume the semantic tokens in
 * ./index.ts, so a brand refresh is a one-file change.
 */
export const palette = {
  light: {
    // Warm Ivory carries the base; cards sit a shade brighter so they lift off it.
    canvas: '#F5EBDD',
    surface: '#FFFBF5',
    raised: '#FFFFFF',
    inset: '#EFE4D4',
    // TRANSPARENT in light mode. The logo ships with transparency and is dark
    // ink on a warm ground — it belongs directly on the canvas. Putting it on a
    // plate here changed how the brand reads in the common case to solve a
    // problem that only exists in dark mode.
    brandPlate: 'transparent',

    // NOT Mushroom Taupe: that is ~2.3:1 on ivory and fails WCAG AA for body
    // text. These stay in the same warm family while remaining legible.
    textPrimary: '#3A2F28',
    textSecondary: '#6B5D51',
    textMuted: '#9C8B7A', // Mushroom Taupe — captions only, never body text
    textInverse: '#FFFBF5',

    // Borders lean on taupe and sage, where softness is the point.
    borderSubtle: '#E2D5C2',
    borderStrong: '#C4B3A0',

    // Dark Raspberry: key actions, headings, brand presence — used with purpose.
    accent: '#8A1538',
    accentHover: '#6E1029',
    accentText: '#FFFBF5',
    accentSoft: '#F4E3E8',

    danger: '#A32218',
    dangerSoft: '#F8E4E1',
    success: '#4E7A43', // Soft Sage, darkened enough to read on ivory
    warning: '#C89B3C', // Antique Gold

    // Priority is a FUNCTIONAL scale, not brand colour: it must read as urgency.
    // Tuned to sit beside the brand palette without competing with raspberry.
    priorityNone: '#9C8B7A',
    priorityLow: '#4E7A43',
    priorityMedium: '#B8860B',
    priorityHigh: '#C2611F',
    priorityUrgent: '#A32218',

    overlay: '#3A2F2866',
    shadow: '#9C8B7A33',
  },

  /**
   * Derived dark mode — the guide defines no dark palette (see BRAND.md).
   * Backgrounds are deep warm browns rather than neutral greys so the palette
   * keeps its warmth, and each brand hue is lifted to a luminance that reads on
   * a dark ground. True raspberry #8A1538 is near-invisible here.
   */
  dark: {
    canvas: '#1A1512',
    surface: '#241D19',
    raised: '#2E2621',
    inset: '#161110',
    // A light plate ONLY here. The mark is dark calligraphy with gold accents,
    // so on a near-black canvas it would be invisible, and a flat tint would
    // discard the gold. A light-on-dark version of the logo would be better
    // still — worth asking the brand owner for one.
    brandPlate: '#F5EBDD',

    textPrimary: '#F2E8DC',
    textSecondary: '#CFC0B0',
    textMuted: '#9C8B7A', // Mushroom Taupe holds up unchanged on dark
    textInverse: '#1A1512',

    borderSubtle: '#3A302A',
    borderStrong: '#544639',

    accent: '#E0577F', // Dark Raspberry, lifted for dark backgrounds
    accentHover: '#EC7A9B',
    accentText: '#1A1512',
    accentSoft: '#3A1E28',

    danger: '#E86A5C',
    dangerSoft: '#3A1E1A',
    success: '#B4C4AA', // Soft Sage reads well as-is on dark
    warning: '#DDB45E', // Antique Gold, lifted

    priorityNone: '#9C8B7A',
    priorityLow: '#B4C4AA',
    priorityMedium: '#DDB45E',
    priorityHigh: '#E89B5C',
    priorityUrgent: '#E86A5C',

    overlay: '#0D0A0899',
    shadow: '#0D0A083D',
  },
} as const;
