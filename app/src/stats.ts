/**
 * Reading the usage counters for the Stats screen.
 *
 * The whole screen is two subscriptions: a range of month documents for the
 * selected scope, and the org-wide root document holding the stored-bytes total.
 * Everything else — daily, weekly and monthly bucketing, and every metric —
 * is derived in memory from the same daily numbers by `@sabeel/shared`, so
 * switching bucketing or metric costs nothing and reads nothing.
 *
 * Live rather than a one-shot read, so today's bar moves as work happens. That
 * is free here: today's bucket is written as events occur, so there is no
 * "current day" computation on either side.
 */
import {
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  where,
  documentId,
} from 'firebase/firestore';
import {
  STATS_ALL_SCOPE,
  monthKeysBetween,
  type StatsMonthDoc,
  type StatsRootDoc,
} from '@sabeel/shared';
import { db } from './firebase';
import { useLiveDoc, useLiveQuery, type LiveState } from './liveQuery';

/**
 * How far back the chart reaches. Bounded deliberately: the subscription costs
 * one document per month, and an unbounded range would grow every month forever
 * for a screen nobody scrolls back that far on. History is kept indefinitely —
 * this is only how much of it is loaded at once.
 */
export const STATS_MONTHS_BACK = 12;

/** The month documents for one scope, oldest first. */
export function useStatsMonths(
  scope: string,
  from: string,
  to: string,
): LiveState<StatsMonthDoc[]> {
  const months = monthKeysBetween(from, to);
  return useLiveQuery<StatsMonthDoc[]>(
    'stats months',
    () =>
      query(
        collection(db, `stats/${scope}/months`),
        // A document-id range, so no composite index is needed and `days` stays
        // exempt from indexing entirely (firestore.indexes.json).
        where(documentId(), '>=', months[0]),
        where(documentId(), '<=', months[months.length - 1]),
        orderBy(documentId()),
      ),
    (docs) =>
      docs.map((d) => ({
        scope,
        month: d.id,
        days: (d.data.days as StatsMonthDoc['days']) ?? {},
      })),
    [scope, months[0], months[months.length - 1]],
  );
}

/**
 * The org-wide stored-file totals.
 *
 * Always the `_all` scope, even when a single board is selected: storage is
 * charged to the organisation, not to a board, and the document holds no
 * per-board breakdown to show. The screen labels it accordingly.
 */
export function useStoredTotals(): LiveState<StatsRootDoc> {
  return useLiveDoc<StatsRootDoc>(
    'stats totals',
    () => doc(db, `stats/${STATS_ALL_SCOPE}`),
    (d) => ({
      bytesStored: (d?.data.bytesStored as number) ?? 0,
      filesStored: (d?.data.filesStored as number) ?? 0,
    }),
    [],
  );
}

// ---- Per-board breakdown of one bucket -------------------------------------

/**
 * Month documents for MANY scopes, read once on demand.
 *
 * A one-shot `getDocs` rather than a hook, and that is the right shape twice
 * over: it runs only when somebody selects a bar, and a breakdown that shifted
 * under the finger reading it would be worse than one a few seconds old. Search
 * reads the same way for the same reason.
 *
 * NOT a `collectionGroup('months')` query, which would be one round trip instead
 * of N — `scope` and `month` are denormalised onto every document precisely for
 * that shape. The rules nest `match /months/{month}` INSIDE `match
 * /stats/{scope}`, which does not authorize a collection-group read; it would
 * need a `match /{path=**}/months/{month}` recursive rule. Widening a rule to
 * save a round trip on a manager-only screen with under twenty boards is not a
 * trade worth making.
 *
 * Reports `failed` rather than rejecting: one unreadable scope must not blank a
 * breakdown that is otherwise correct, and a SHORT list rendered as if complete
 * is exactly the kind of quiet wrong this screen has been bitten by before.
 */
export async function fetchStatsMonths(
  scopes: readonly string[],
  months: readonly string[],
  /** Today's ORG-timezone day key, so the live month is never cached. */
  today: string,
): Promise<{ docs: StatsMonthDoc[]; failed: number }> {
  if (scopes.length === 0 || months.length === 0) return { docs: [], failed: 0 };

  const settled = await Promise.allSettled(
    scopes.map((scope) => fetchOneScope(scope, months, today)),
  );

  const docs: StatsMonthDoc[] = [];
  let failed = 0;
  for (const r of settled) {
    if (r.status === 'fulfilled') docs.push(...r.value);
    else failed += 1;
  }
  return { docs, failed };
}

async function fetchOneScope(
  scope: string,
  months: readonly string[],
  today: string,
): Promise<StatsMonthDoc[]> {
  const wanted = [...months].sort();
  const missing = wanted.filter((m) => monthCache.get(cacheKey(scope, m)) === undefined);
  /**
   * What THIS call read, kept separately from the cache.
   *
   * Load-bearing, not a convenience: `remember` deliberately refuses to store
   * the month in progress, so a result path that read back only from the cache
   * threw away the very documents it had just fetched — and every breakdown of
   * a bar in the current month came back empty. Caught by a 320px screenshot,
   * where the panel's own unattributed row reported the whole bar as
   * unaccounted for rather than showing a plausible empty list.
   */
  const fresh = new Map<string, StatsMonthDoc>();

  if (missing.length > 0) {
    // The same document-id range `useStatsMonths` uses, so no index is needed
    // and `days` stays exempt from indexing entirely. A bucket spans one or two
    // consecutive months, so the range is exact rather than over-wide.
    const snap = await getDocs(
      query(
        collection(db, `stats/${scope}/months`),
        where(documentId(), '>=', missing[0]),
        where(documentId(), '<=', missing[missing.length - 1]),
      ),
    );
    const found = new Map(snap.docs.map((d) => [d.id, d.data()]));
    for (const month of missing) {
      const data = found.get(month);
      const doc: StatsMonthDoc = {
        scope,
        month,
        // An ABSENT document is a real answer — that board did nothing that
        // month — and caching it is what stops every quiet board being re-read
        // on every tap.
        days: (data?.days as StatsMonthDoc['days']) ?? {},
      };
      fresh.set(month, doc);
      remember(scope, month, today, doc);
    }
  }

  return wanted.map(
    (m) =>
      fresh.get(m) ?? monthCache.get(cacheKey(scope, m)) ?? { scope, month: m, days: {} },
  );
}

/**
 * Month documents already read, keyed by scope and month.
 *
 * Module-level rather than component state, because the whole point of the
 * breakdown is that a row navigates to its board — which unmounts this screen
 * and would otherwise throw the reads away just as somebody presses Back.
 *
 * Bounded and cleared on sign-out, the two obligations the live-query cache
 * beside it already discovered: the keys contain board ids, so it would
 * otherwise grow for the life of the session, and on a shared device the next
 * person to sign in must not inherit the previous one's figures.
 */
const monthCache = new Map<string, StatsMonthDoc>();
const MAX_CACHED_MONTHS = 400;

const cacheKey = (scope: string, month: string) => `${scope}/${month}`;

function remember(scope: string, month: string, today: string, value: StatsMonthDoc) {
  // NEVER cache the month in progress. The chart is a live subscription
  // specifically so today's bar moves as work happens (see the note at the top
  // of this file); a frozen breakdown under a moving bar is the worst kind of
  // wrong, because neither number looks it.
  if (month === today.slice(0, 7)) return;

  const key = cacheKey(scope, month);
  if (monthCache.size >= MAX_CACHED_MONTHS) {
    const oldest = monthCache.keys().next().value;
    if (oldest !== undefined) monthCache.delete(oldest);
  }
  monthCache.delete(key);
  monthCache.set(key, value);
}

/** Drop every cached month. Called on sign-out, beside `clearLiveResultCache`. */
export function clearStatsCache(): void {
  monthCache.clear();
}
