/**
 * Semantic theme tokens. Every color in the app comes from here.
 *
 * Light and dark ship together from Phase 0 by decision (docs/PRODUCT_BRIEF.md,
 * "Theming") — the app follows the OS setting. Building it now costs almost
 * nothing; retrofitting it after fifteen screens have hardcoded colors is a
 * miserable, error-prone job.
 *
 * Usage:
 *   const t = useTheme();
 *   <View style={{ backgroundColor: t.bg.surface }}>
 *
 * Names describe ROLE, not appearance — `text.muted`, never `text.grey`. That is
 * what lets dark mode invert without every reference becoming a lie.
 */
import { useColorScheme } from 'react-native';
import { palette } from './palette';
import type { Priority } from '@sabeel/shared';

export type ThemeName = 'light' | 'dark';

function build(name: ThemeName) {
  const p = palette[name];
  return {
    name,
    bg: {
      /** App background, behind everything. */
      canvas: p.canvas,
      /** Cards, sheets, list rows. */
      surface: p.surface,
      /** Surfaces that sit above other surfaces (menus, dragged card). */
      raised: p.raised,
      /** Recessed areas — text inputs, column bodies. */
      inset: p.inset,
      /** Tint behind selected/active items. */
      accentSoft: p.accentSoft,
      /** Tint behind destructive confirmation. */
      dangerSoft: p.dangerSoft,
      /**
       * Ground for the Sabeel logo: TRANSPARENT in light (the mark is supplied
       * with transparency and sits on the canvas as intended), a light plate in
       * dark only, where dark ink would otherwise disappear.
       */
      brandPlate: p.brandPlate,
    },
    text: {
      primary: p.textPrimary,
      secondary: p.textSecondary,
      /** Timestamps, counts, placeholder text. */
      muted: p.textMuted,
      /** Text on an accent-filled surface. */
      inverse: p.textInverse,
      accent: p.accent,
      danger: p.danger,
    },
    border: {
      subtle: p.borderSubtle,
      strong: p.borderStrong,
    },
    accent: {
      base: p.accent,
      hover: p.accentHover,
      onAccent: p.accentText,
    },
    feedback: {
      danger: p.danger,
      success: p.success,
      warning: p.warning,
    },
    /** Card priority dot. Keyed by the shared Priority union. */
    priority: {
      none: p.priorityNone,
      low: p.priorityLow,
      medium: p.priorityMedium,
      high: p.priorityHigh,
      urgent: p.priorityUrgent,
    } satisfies Record<Priority, string>,
    effect: {
      overlay: p.overlay,
      shadow: p.shadow,
    },
  } as const;
}

export type Theme = ReturnType<typeof build>;

const themes: Record<ThemeName, Theme> = {
  light: build('light'),
  dark: build('dark'),
};

/**
 * Follows the OS appearance. No manual override in v1 — decided in the brief;
 * if that changes, this hook is the single place to layer a stored preference
 * on top, and no screen needs touching.
 */
export function useTheme(): Theme {
  const scheme = useColorScheme();
  return scheme === 'dark' ? themes.dark : themes.light;
}

/** Non-hook access, for the rare module that cannot use hooks. */
export function getTheme(name: ThemeName): Theme {
  return themes[name];
}

/** Spacing scale, in points. Use these rather than ad-hoc numbers. */
export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

/** Type scale. */
export const type = {
  title: { fontSize: 22, fontWeight: '700' },
  heading: { fontSize: 17, fontWeight: '600' },
  body: { fontSize: 15, fontWeight: '400' },
  label: { fontSize: 13, fontWeight: '500' },
  caption: { fontSize: 12, fontWeight: '400' },
} as const;

export const radius = {
  sm: 6,
  md: 10,
  lg: 14,
  pill: 999,
} as const;
