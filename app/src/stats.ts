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
import { collection, doc, orderBy, query, where, documentId } from 'firebase/firestore';
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
