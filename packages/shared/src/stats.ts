/**
 * Turning stored daily buckets into something a chart can draw.
 *
 * Everything here is PURE and operates on `YYYY-MM-DD` strings. That is not a
 * stylistic choice: bucketing by calendar week means asking "which Sunday does
 * this day belong to", and doing that with local `Date` objects makes the answer
 * depend on the reader's machine and on daylight saving. String arithmetic via
 * `addDays` has neither problem — a day is a day.
 *
 * The only place a timezone is consulted at all is deciding which day an event
 * happened on, which happens once, server-side, at write time (`recordStat`).
 */
import { addDays } from './due';
import type { StatsCounter, StatsDay, StatsMonthDoc } from './types';

/**
 * The scope id for the org-wide roll-up, written alongside every board's own
 * bucket so "all boards" is one read path rather than a fan-in over every board.
 *
 * Safe as a document id: board ids are 20-character generated strings, so no
 * board can collide with it, and only ids of the form `__…__` are reserved.
 */
export const STATS_ALL_SCOPE = '_all';

export type StatsBucketing = 'day' | 'week' | 'month';

/**
 * What the chart can plot. `activePeople` is the odd one out — it is not stored,
 * it is the size of the union of `actors`, which is why aggregation below is
 * metric-aware rather than a generic sum.
 */
export type StatsMetric = StatsCounter | 'activePeople';

export const STATS_METRICS: {
  key: StatsMetric;
  /** Chip text. */
  label: string;
  /** Sentence form for a bar's accessibility label, e.g. "3 cards created". */
  noun: string;
  /** Byte metrics are formatted with `formatBytes`, not printed raw. */
  bytes?: true;
}[] = [
  { key: 'cardsCreated', label: 'Cards created', noun: 'cards created' },
  { key: 'cardsArchived', label: 'Cards archived', noun: 'cards archived' },
  { key: 'comments', label: 'Comments', noun: 'comments' },
  { key: 'activePeople', label: 'Active people', noun: 'people active' },
  { key: 'filesAdded', label: 'Files added', noun: 'files added' },
  { key: 'filesRemoved', label: 'Files removed', noun: 'files removed' },
];

/** The Sunday on or before `dayKey`. Calendar weeks, never a trailing 7 days. */
export function startOfWeek(dayKey: string): string {
  const [y, m, d] = dayKey.split('-').map(Number);
  // getUTCDay on a UTC-constructed date: 0 = Sunday, and no local time involved.
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return addDays(dayKey, -dow);
}

/** The first of `dayKey`'s month. */
export function startOfMonth(dayKey: string): string {
  return `${dayKey.slice(0, 7)}-01`;
}

/**
 * The first of the month `n` calendar months before `dayKey`'s.
 *
 * Calendar months, not 30-day approximations: "twelve months back" has to mean
 * twelve months whichever months they are, and a fixed 30 lands short or long
 * depending on how many 31-day months and Februaries the span happens to cross.
 */
export function monthsBack(dayKey: string, n: number): string {
  const y = Number(dayKey.slice(0, 4));
  const m = Number(dayKey.slice(5, 7)) - 1 - n; // 0-based, may go negative
  const year = y + Math.floor(m / 12);
  const month = ((m % 12) + 12) % 12;
  return `${year}-${String(month + 1).padStart(2, '0')}-01`;
}

/** Which bucket a day belongs to, as that bucket's first day. */
export function bucketStart(dayKey: string, bucketing: StatsBucketing): string {
  if (bucketing === 'week') return startOfWeek(dayKey);
  if (bucketing === 'month') return startOfMonth(dayKey);
  return dayKey;
}

/** The `YYYY-MM` document ids spanning `from`…`to` inclusive. */
export function monthKeysBetween(from: string, to: string): string[] {
  const keys: string[] = [];
  let cur = startOfMonth(from);
  const last = to.slice(0, 7);
  while (cur.slice(0, 7) <= last) {
    keys.push(cur.slice(0, 7));
    // Adding 31 days then snapping back to the 1st always lands in the NEXT
    // month, whatever its length. Adding a month by index would need care in
    // December; this needs none.
    cur = startOfMonth(addDays(cur, 31));
  }
  return keys;
}

export interface StatsDayEntry {
  day: string;
  stats: StatsDay;
}

/**
 * Flatten month documents into one day-per-entry series over `from`…`to`,
 * filling absent days with an empty bucket.
 *
 * The gap filling is what stops a quiet Tuesday from being INVISIBLE. Without
 * it the chart would silently close the gap and put Monday next to Wednesday,
 * so a week with three idle days would look like a busy short week.
 */
export function toDailySeries(
  months: readonly StatsMonthDoc[],
  from: string,
  to: string,
): StatsDayEntry[] {
  const byMonth = new Map(months.map((m) => [m.month, m]));
  const out: StatsDayEntry[] = [];
  for (let day = from; day <= to; day = addDays(day, 1)) {
    const doc = byMonth.get(day.slice(0, 7));
    out.push({ day, stats: doc?.days?.[day.slice(8, 10)] ?? {} });
  }
  return out;
}

/**
 * The uids active in `[from..to]` — the set `aggregate` computes and discards.
 *
 * Exists because "3 people were active" and "which three" are the same
 * question asked twice, and only the second one can be answered from a count.
 * Sorted, so a caller rendering it gets a stable order without asking.
 */
export function actorsBetween(
  series: readonly StatsDayEntry[],
  from: string,
  to: string,
): string[] {
  const set = new Set<string>();
  for (const entry of series) {
    if (entry.day < from || entry.day > to) continue;
    for (const uid of entry.stats.actors ?? []) set.add(uid);
  }
  return [...set].sort();
}

/**
 * One metric's value over `[from..to]`, inclusive.
 *
 * Counters sum; `activePeople` is the size of a union, for the reason
 * `aggregate` states below. Both live here so there is one implementation of
 * that split rather than one per caller — a board ranking that summed distinct
 * daily counts would be wrong in exactly the way this package already knows
 * about.
 */
export function valueBetween(
  series: readonly StatsDayEntry[],
  from: string,
  to: string,
  metric: StatsMetric,
): number {
  if (metric === 'activePeople') return actorsBetween(series, from, to).length;
  let sum = 0;
  for (const entry of series) {
    if (entry.day < from || entry.day > to) continue;
    sum += entry.stats[metric] ?? 0;
  }
  return sum;
}

export interface StatsPoint {
  /** First day of the bucket — `YYYY-MM-DD`, whatever the bucketing. */
  start: string;
  /** Last day of the bucket. Equal to `start` for daily bucketing. */
  end: string;
  value: number;
}

/**
 * Collapse a daily series into buckets of one metric.
 *
 * Counters sum. `activePeople` unions, because the same colleague working on
 * Monday and Tuesday is one active person that week, not two — summing daily
 * counts is the classic distinct-count error and would make a quiet week with
 * one busy person outrank a week where the whole team appeared once.
 */
export function aggregate(
  series: readonly StatsDayEntry[],
  bucketing: StatsBucketing,
  metric: StatsMetric,
): StatsPoint[] {
  const order: string[] = [];
  const ends = new Map<string, string>();

  for (const entry of series) {
    const start = bucketStart(entry.day, bucketing);
    if (!ends.has(start)) order.push(start);
    // The series is ascending, so the last day seen for a bucket is its end.
    // That also keeps a partial trailing bucket from claiming to end in the
    // future, which is what makes `[start, end]` a range you can re-query.
    ends.set(start, entry.day);
  }

  // Each bucket's value comes from `valueBetween` over its own day range rather
  // than from a second accumulator here. That is what lets a per-board
  // breakdown of a selected bucket be computed by the SAME function over the
  // SAME range — so the rows add up to the bar by construction rather than by
  // two implementations agreeing. Quadratic in bucket count, which at a year of
  // daily buckets is a few hundred thousand comparisons and unmeasurable.
  return order.map((start) => {
    const end = ends.get(start) ?? start;
    return { start, end, value: valueBetween(series, start, end, metric) };
  });
}
