import { describe, it, expect } from 'vitest';
import {
  actorsBetween,
  aggregate,
  bucketStart,
  monthKeysBetween,
  monthsBack,
  startOfMonth,
  startOfWeek,
  toDailySeries,
  valueBetween,
  STATS_METRICS,
} from '../src/stats';
import type { StatsMonthDoc } from '../src/types';

describe('startOfWeek', () => {
  it('snaps to the Sunday on or before the day', () => {
    // 2026-07-26 is a Sunday.
    expect(startOfWeek('2026-07-26')).toBe('2026-07-26');
    expect(startOfWeek('2026-07-27')).toBe('2026-07-26'); // Monday
    expect(startOfWeek('2026-08-01')).toBe('2026-07-26'); // Saturday
  });

  it('is a CALENDAR week, not a trailing seven days', () => {
    // The distinction the product asked for: every day from Sun 26 Jul to
    // Sat 1 Aug shares one bucket, and 2 Aug starts a new one.
    const week = ['26', '27', '28', '29', '30', '31'].map((d) => `2026-07-${d}`);
    for (const day of week) expect(startOfWeek(day)).toBe('2026-07-26');
    expect(startOfWeek('2026-08-01')).toBe('2026-07-26');
    expect(startOfWeek('2026-08-02')).toBe('2026-08-02');
  });

  it('crosses month and year boundaries', () => {
    // 2027-01-01 is a Friday, so its week began 2026-12-27.
    expect(startOfWeek('2027-01-01')).toBe('2026-12-27');
    expect(startOfWeek('2026-03-03')).toBe('2026-03-01');
  });

  it('is unaffected by the machine timezone', () => {
    // Same reason `addDays` has this test: a chart must not re-bucket itself
    // because the reader is in Auckland.
    const original = process.env.TZ;
    try {
      for (const tz of ['UTC', 'Pacific/Kiritimati', 'Pacific/Niue', 'America/Chicago']) {
        process.env.TZ = tz;
        expect(startOfWeek('2026-07-27')).toBe('2026-07-26');
      }
    } finally {
      process.env.TZ = original;
    }
  });

  it('is stable across a daylight-saving transition', () => {
    // US DST began 2026-03-08 (a Sunday). Date arithmetic that touched local
    // time would drop or duplicate an hour here and could land on the Saturday.
    expect(startOfWeek('2026-03-08')).toBe('2026-03-08');
    expect(startOfWeek('2026-03-09')).toBe('2026-03-08');
    expect(startOfWeek('2026-11-01')).toBe('2026-11-01');
  });
});

describe('startOfMonth / bucketStart', () => {
  it('snaps to the first', () => {
    expect(startOfMonth('2026-07-28')).toBe('2026-07-01');
    expect(startOfMonth('2026-01-01')).toBe('2026-01-01');
  });

  it('leaves a day alone when bucketing by day', () => {
    expect(bucketStart('2026-07-28', 'day')).toBe('2026-07-28');
    expect(bucketStart('2026-07-28', 'week')).toBe('2026-07-26');
    expect(bucketStart('2026-07-28', 'month')).toBe('2026-07-01');
  });
});

describe('monthsBack', () => {
  it('counts CALENDAR months, not thirty-day steps', () => {
    expect(monthsBack('2026-07-28', 0)).toBe('2026-07-01');
    expect(monthsBack('2026-07-28', 1)).toBe('2026-06-01');
    expect(monthsBack('2026-07-28', 11)).toBe('2025-08-01');
  });

  it('crosses year boundaries in both directions of the arithmetic', () => {
    expect(monthsBack('2026-01-15', 1)).toBe('2025-12-01');
    expect(monthsBack('2026-01-15', 12)).toBe('2025-01-01');
    expect(monthsBack('2026-01-15', 13)).toBe('2024-12-01');
    expect(monthsBack('2026-03-01', 25)).toBe('2024-02-01');
  });

  it('is unaffected by month lengths — the bug the old 30-day maths had', () => {
    // Eleven months back from any day in a given month is the same month,
    // whatever mix of 28-, 30- and 31-day months lies between.
    for (const day of ['2026-03-31', '2026-03-01', '2026-03-15']) {
      expect(monthsBack(day, 11)).toBe('2025-04-01');
    }
  });

  it('always spans exactly n+1 month keys, every month of the year', () => {
    // The property STATS_MONTHS_BACK actually promises. The old derivation
    // (330 days, then snap) could yield 11 or 13 depending on the months.
    for (let m = 1; m <= 12; m++) {
      const day = `2026-${String(m).padStart(2, '0')}-15`;
      expect(monthKeysBetween(monthsBack(day, 11), day)).toHaveLength(12);
    }
  });
});

describe('monthKeysBetween', () => {
  it('covers both endpoints', () => {
    expect(monthKeysBetween('2026-07-28', '2026-07-28')).toEqual(['2026-07']);
    expect(monthKeysBetween('2026-06-30', '2026-08-01')).toEqual([
      '2026-06',
      '2026-07',
      '2026-08',
    ]);
  });

  it('crosses a year end', () => {
    expect(monthKeysBetween('2026-11-15', '2027-02-03')).toEqual([
      '2026-11',
      '2026-12',
      '2027-01',
      '2027-02',
    ]);
  });

  it('does not skip February', () => {
    // The +31-days-then-snap trick has to survive the shortest month.
    expect(monthKeysBetween('2026-01-31', '2026-04-01')).toEqual([
      '2026-01',
      '2026-02',
      '2026-03',
      '2026-04',
    ]);
  });

  it('spans a year without duplicating or dropping a month', () => {
    const keys = monthKeysBetween('2025-08-01', '2026-07-31');
    expect(keys).toHaveLength(12);
    expect(new Set(keys).size).toBe(12);
    expect(keys[0]).toBe('2025-08');
    expect(keys.at(-1)).toBe('2026-07');
  });
});

const months: StatsMonthDoc[] = [
  {
    scope: '_all',
    month: '2026-07',
    days: {
      '26': { cardsCreated: 2, actors: ['ann'] },
      '28': { cardsCreated: 3, comments: 1, actors: ['ann', 'bo'] },
    },
  },
];

describe('toDailySeries', () => {
  it('fills absent days rather than closing the gap', () => {
    const series = toDailySeries(months, '2026-07-26', '2026-07-29');
    expect(series.map((e) => e.day)).toEqual([
      '2026-07-26',
      '2026-07-27',
      '2026-07-28',
      '2026-07-29',
    ]);
    // The quiet days are present and empty — a bar of zero, not a missing bar.
    expect(series[1].stats).toEqual({});
    expect(series[3].stats).toEqual({});
    expect(series[0].stats.cardsCreated).toBe(2);
  });

  it('returns empty buckets when the month document does not exist', () => {
    const series = toDailySeries([], '2026-07-26', '2026-07-27');
    expect(series).toHaveLength(2);
    expect(series.every((e) => Object.keys(e.stats).length === 0)).toBe(true);
  });

  it('spans a month boundary', () => {
    const series = toDailySeries(months, '2026-06-30', '2026-08-01');
    expect(series).toHaveLength(33);
    expect(series[0].day).toBe('2026-06-30');
    expect(series.at(-1)!.day).toBe('2026-08-01');
  });
});

describe('aggregate', () => {
  const series = toDailySeries(months, '2026-07-26', '2026-08-01');

  it('sums a counter across the bucket', () => {
    expect(aggregate(series, 'week', 'cardsCreated')).toEqual([
      { start: '2026-07-26', end: '2026-08-01', value: 5 },
    ]);
  });

  it('keeps one point per day when bucketing daily', () => {
    const points = aggregate(series, 'day', 'cardsCreated');
    expect(points).toHaveLength(7);
    expect(points[0]).toEqual({ start: '2026-07-26', end: '2026-07-26', value: 2 });
    expect(points[1].value).toBe(0);
  });

  it('UNIONS active people rather than summing them', () => {
    // Ann worked on both days. Summing daily counts would say three people
    // were active that week; the truth is two.
    expect(aggregate(series, 'week', 'activePeople')).toEqual([
      { start: '2026-07-26', end: '2026-08-01', value: 2 },
    ]);
    expect(aggregate(series, 'day', 'activePeople').map((p) => p.value)).toEqual([
      1, 0, 2, 0, 0, 0, 0,
    ]);
  });

  it('splits into separate buckets at a week boundary', () => {
    const wide = toDailySeries(months, '2026-07-25', '2026-08-02');
    const points = aggregate(wide, 'week', 'cardsCreated');
    // Sat 25 Jul closes the previous week; Sun 2 Aug opens the next.
    expect(points.map((p) => p.start)).toEqual([
      '2026-07-19',
      '2026-07-26',
      '2026-08-02',
    ]);
    expect(points.map((p) => p.value)).toEqual([0, 5, 0]);
  });

  it('reports the true last day of each bucket', () => {
    // A partial trailing bucket must not claim to end in the future.
    const points = aggregate(toDailySeries(months, '2026-07-26', '2026-07-29'), 'week', 'comments');
    expect(points).toEqual([{ start: '2026-07-26', end: '2026-07-29', value: 1 }]);
  });

  it('returns nothing for an empty series', () => {
    expect(aggregate([], 'month', 'comments')).toEqual([]);
  });
});

describe('STATS_METRICS', () => {
  it('covers every metric the product asked for, once', () => {
    expect(STATS_METRICS.map((m) => m.key)).toEqual([
      'cardsCreated',
      'cardsArchived',
      'comments',
      'activePeople',
      'filesAdded',
      'filesRemoved',
    ]);
  });
});

describe('actorsBetween / valueBetween', () => {
  const series = toDailySeries(months, '2026-07-26', '2026-08-01');

  it('names the people active in a range, deduped and sorted', () => {
    // Ann worked on the 26th and the 28th; she is one person, not two.
    expect(actorsBetween(series, '2026-07-26', '2026-08-01')).toEqual(['ann', 'bo']);
    expect(actorsBetween(series, '2026-07-26', '2026-07-26')).toEqual(['ann']);
  });

  it('is inclusive at both ends and excludes days outside the range', () => {
    expect(actorsBetween(series, '2026-07-27', '2026-07-28')).toEqual(['ann', 'bo']);
    expect(actorsBetween(series, '2026-07-29', '2026-08-01')).toEqual([]);
  });

  it('sums a counter and unions active people', () => {
    expect(valueBetween(series, '2026-07-26', '2026-08-01', 'cardsCreated')).toBe(5);
    expect(valueBetween(series, '2026-07-26', '2026-08-01', 'comments')).toBe(1);
    // NOT 3 — the same person on two days is one active person.
    expect(valueBetween(series, '2026-07-26', '2026-08-01', 'activePeople')).toBe(2);
  });

  it('returns zero for a range whose days are all absent', () => {
    expect(valueBetween(series, '2026-07-29', '2026-08-01', 'cardsCreated')).toBe(0);
    expect(valueBetween(series, '2026-07-29', '2026-08-01', 'activePeople')).toBe(0);
    expect(valueBetween([], '2026-07-26', '2026-08-01', 'comments')).toBe(0);
  });

  /**
   * The property the board breakdown rests on: a bucket's rows are computed by
   * this function over the bucket's own range, so they must agree with the bar
   * the chart drew for it — including a WEEK that spans two month documents.
   */
  it('agrees with aggregate over each bucket, across a month boundary', () => {
    const wide = toDailySeries(months, '2026-07-20', '2026-08-05');
    for (const metric of ['cardsCreated', 'comments', 'activePeople'] as const) {
      for (const point of aggregate(wide, 'week', metric)) {
        expect(valueBetween(wide, point.start, point.end, metric)).toBe(point.value);
      }
    }
  });
});
