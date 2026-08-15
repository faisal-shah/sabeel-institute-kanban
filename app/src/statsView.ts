/**
 * What the Stats screen is currently showing — held OUTSIDE React.
 *
 * The same reason Search's filters live outside their screen: `App.tsx` renders
 * one screen per route, so pushing anything unmounts `StatsScreen` and every
 * `useState` in it dies. That was harmless while Stats was a dead end, and stops
 * being harmless the moment a row in the breakdown navigates to its board —
 * Back would return you to the default view with your selection gone, having
 * lost the board filter, the period, the metric and the bar you were reading.
 *
 * SESSION ONLY, like the search filters, and reset on sign-out for the same
 * reason: `scope` is a board id, and on a shared device the next person must not
 * arrive at someone else's board pre-selected.
 */
import type { StatsBucketing, StatsMetric } from '@sabeel/shared';
import { STATS_ALL_SCOPE } from '@sabeel/shared';
import { createViewStore } from './viewState';

export interface StatsView {
  /** A board id, or `STATS_ALL_SCOPE`. */
  scope: string;
  bucketing: StatsBucketing;
  metric: StatsMetric;
  /**
   * The selected bucket's first day, or null for none.
   *
   * Null is not merely "nothing highlighted": the breakdown below the chart
   * exists only while a bucket is selected, because without one it would have to
   * cover the whole loaded year — a different question, and a fan-out of reads
   * nobody asked for.
   */
  selectedStart: string | null;
}

const EMPTY_STATS_VIEW: StatsView = {
  scope: STATS_ALL_SCOPE,
  bucketing: 'day',
  metric: 'cardsCreated',
  selectedStart: null,
};

const store = createViewStore<StatsView>(EMPTY_STATS_VIEW);

// Only what the screen actually calls. The store's `get` and `reset` have no
// reader here — sign-out already empties this through `resetAllViewStores` —
// and an exported handle nothing uses is one somebody reaches for later without
// the reason it was left there.
export const setStatsView = store.set;
export const useStatsView = store.use;

/**
 * Change one of the three controls, dropping any selection with it.
 *
 * Every one of them invalidates the selected bucket, and each in its own way:
 * a different BUCKETING makes `selectedStart` a key that matches no bar at all;
 * a different METRIC or SCOPE can make the chart render "Nothing recorded in
 * this period" instead of any bars, leaving a breakdown sitting under a chart
 * that has none. Keeping the selection looked like a convenience — the same
 * week, one metric over — and each of those is a way for the panel to describe
 * something not on screen.
 */
export function setStatsControl(patch: Partial<Omit<StatsView, 'selectedStart'>>): void {
  setStatsView({ ...patch, selectedStart: null });
}
