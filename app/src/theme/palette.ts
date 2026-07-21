/**
 * Raw color values. THE ONLY FILE IN THE APP ALLOWED TO CONTAIN COLOR LITERALS —
 * an ESLint rule enforces this everywhere under app/src except app/src/theme.
 *
 * These are the Sabeel Institute brand colors, **Option 1** — the designer's
 * revised palette (2026-07-21), which SUPERSEDES the original
 * `docs/brand/sabeel-color-usage-guide.jpg`. `docs/BRAND.md` restates it and
 * records the two places this palette deliberately departs from it (body-text
 * contrast, and a derived dark mode). Read BRAND.md before changing anything.
 *
 *   Warm Ivory     #F6EBDD   foundation — backgrounds, cards
 *   Soft Sage      #A8B89A   calm & community — alternate surfaces
 *   Dark Raspberry #83114F   brand identity — headings, buttons, links
 *   Antique Gold   #C6A15B   elegance — dividers, accents, hover
 *   Mushroom Taupe #A58D7A   support — borders, captions, shadows
 *
 * Option 1 is a real revision, not a re-measure: raspberry moved from a brick
 * red (#8A1538) to this plum (ΔE ~17), and gold to a muted tan (ΔE ~13). Both
 * apps shipped the old hues, so this is a coordinated change, not a correction
 * of one against the other. The sibling time-tracker matches this same palette.
 *
 * Nothing outside src/theme imports this. Screens consume the semantic tokens in
 * ./index.ts, so a brand refresh is a one-file change.
 */
export const palette = {
  light: {
    // Warm Ivory carries the base; cards sit a shade brighter so they lift off it.
    canvas: '#F6EBDD',
    surface: '#FBF6F0',
    raised: '#FFFFFF',
    inset: '#E7DDD0',
    // NOT Mushroom Taupe: that is ~2.7:1 on ivory and fails WCAG AA for body
    // text. These stay in the same warm family while remaining legible.
    textPrimary: '#3A2F28',
    textSecondary: '#6A5748',
    textMuted: '#A58D7A', // Mushroom Taupe — captions only, never body text
    textInverse: '#F9F2E9',

    // Borders lean on taupe and sage, where softness is the point.
    borderSubtle: '#DFD1C1',
    borderStrong: '#C9B7A7',

    // Dark Raspberry: key actions, headings, brand presence — used with purpose.
    accent: '#83114F',
    accentHover: '#660D3E',
    accentText: '#F9F2E9',
    accentSoft: '#E6CCC9',

    danger: '#A32218',
    dangerSoft: '#F8E4E1',
    success: '#4E7A43', // Soft Sage, darkened enough to read on ivory
    // Antique Gold deepened to #977535 so a warning actually reads — true gold
    // #C6A15B is ~2.1:1 on ivory. Gold stays true where it is decoration, not
    // signal (borders, dividers); the semantic tokens keep those separate.
    warning: '#977535',

    // Priority is a FUNCTIONAL scale, not brand colour: it must read as urgency.
    // With raspberry now plum, these oranges/reds no longer risk reading as it.
    priorityNone: '#A58D7A',
    priorityLow: '#4E7A43',
    priorityMedium: '#B8860B',
    priorityHigh: '#C2611F',
    priorityUrgent: '#A32218',

    overlay: '#3A2F2866',
    shadow: '#A58D7A33',
  },

  /**
   * Derived dark mode — neither the guide nor Option 1 defines one (see
   * BRAND.md). Backgrounds are deep warm browns rather than neutral greys so the
   * palette keeps its warmth, and each brand hue is lifted to a luminance that
   * reads on a dark ground while holding its hue. The accent is the new plum
   * (hue 327°) lifted to #D85A9F — NOT the old pink dark-accent, which belonged
   * to the brick-red raspberry.
   */
  dark: {
    canvas: '#1A1512',
    surface: '#241D19',
    raised: '#2E2621',
    inset: '#161110',
    textPrimary: '#F2E8DC',
    textSecondary: '#CFC0B0',
    textMuted: '#A58D7A', // Mushroom Taupe holds up unchanged on dark
    textInverse: '#1A1512',

    borderSubtle: '#3A302A',
    borderStrong: '#544639',

    accent: '#D85A9F', // Dark Raspberry (plum), lifted for dark backgrounds
    accentHover: '#E085B7',
    accentText: '#1A1512',
    accentSoft: '#40232E',

    danger: '#E86A5C',
    dangerSoft: '#3A1E1A',
    success: '#A8B89A', // Soft Sage reads well as-is on dark
    warning: '#CDAD6F', // Antique Gold, lifted

    priorityNone: '#A58D7A',
    priorityLow: '#A8B89A',
    priorityMedium: '#DDB45E',
    priorityHigh: '#E89B5C',
    priorityUrgent: '#E86A5C',

    overlay: '#0D0A0899',
    shadow: '#0D0A083D',
  },
} as const;
