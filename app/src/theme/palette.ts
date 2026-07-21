/**
 * Raw color values. THE ONLY FILE IN THE APP ALLOWED TO CONTAIN COLOR LITERALS —
 * an ESLint rule enforces this everywhere under app/src except app/src/theme.
 *
 * These are the Sabeel Institute brand colors, **Option 1** — the designer's
 * revised palette (2026-07-21), which SUPERSEDES the original
 * `docs/brand/sabeel-color-usage-guide.jpg`. `docs/BRAND.md` restates it and
 * records where this palette deliberately departs from it for accessibility
 * (body text and gold-as-signal need deeper cuts). Read BRAND.md first.
 *
 * SINGLE LIGHT THEME. There is no dark mode — decided 2026-07-21. The app is
 * light only; `palette` is one object, not light/dark variants.
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
} as const;
