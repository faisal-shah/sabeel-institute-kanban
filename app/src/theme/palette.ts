/**
 * Raw color values. THE ONLY FILE IN THE APP ALLOWED TO CONTAIN COLOR LITERALS —
 * an ESLint rule enforces this everywhere under app/src except app/src/theme.
 *
 * Nothing outside src/theme should import this. Screens and components consume
 * the semantic tokens in ./index.ts instead, so that a color can be retuned in
 * one place and both themes stay coherent.
 *
 * Every pair below was chosen to hold contrast on its own background: light
 * values sit on near-white, dark values on near-black.
 */
export const palette = {
  light: {
    canvas: '#F6F7F9',
    surface: '#FFFFFF',
    raised: '#FFFFFF',
    inset: '#EDEFF2',

    textPrimary: '#16191D',
    textSecondary: '#4A515B',
    textMuted: '#78808C',
    textInverse: '#FFFFFF',

    borderSubtle: '#E2E5EA',
    borderStrong: '#C7CCD4',

    accent: '#1F6FEB',
    accentHover: '#1A5FCC',
    accentText: '#FFFFFF',
    accentSoft: '#E7F0FE',

    danger: '#CF222E',
    dangerSoft: '#FFEBE9',
    success: '#2DA44E',
    warning: '#BF8700',

    priorityNone: '#9AA2AD',
    priorityLow: '#2DA44E',
    priorityMedium: '#BF8700',
    priorityHigh: '#C4630B',
    priorityUrgent: '#CF222E',

    overlay: '#16191D66',
    shadow: '#16191D1F',
  },
  dark: {
    canvas: '#0D1117',
    surface: '#161B22',
    raised: '#1C232C',
    inset: '#10151B',

    textPrimary: '#E6EDF3',
    textSecondary: '#A9B4C0',
    textMuted: '#7A8592',
    textInverse: '#0D1117',

    borderSubtle: '#272E38',
    borderStrong: '#3A434F',

    accent: '#4C8DF6',
    accentHover: '#6BA1F8',
    accentText: '#0D1117',
    accentSoft: '#132542',

    danger: '#F85149',
    dangerSoft: '#2A1315',
    success: '#3FB950',
    warning: '#D29922',

    priorityNone: '#7A8592',
    priorityLow: '#3FB950',
    priorityMedium: '#D29922',
    priorityHigh: '#F0883E',
    priorityUrgent: '#F85149',

    overlay: '#01040999',
    shadow: '#0104093D',
  },
} as const;
