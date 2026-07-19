import { describe, it, expect } from 'vitest';
import {
  RankError,
  compareRank,
  initialRanks,
  needsRerank,
  rankBetween,
  rerank,
} from '../src/rank';

/** Deterministic pseudo-random, so a failure is reproducible from the seed. */
function makeRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

describe('rankBetween basics', () => {
  it('produces a rank for an empty column', () => {
    const r = rankBetween(null, null);
    expect(r.length).toBeGreaterThan(0);
  });

  it('appends after a rank', () => {
    const a = rankBetween(null, null);
    expect(rankBetween(a, null) > a).toBe(true);
  });

  it('prepends before a rank', () => {
    const a = rankBetween(null, null);
    expect(rankBetween(null, a) < a).toBe(true);
  });

  it('lands strictly between two ranks', () => {
    const a = rankBetween(null, null);
    const b = rankBetween(a, null);
    const mid = rankBetween(a, b);
    expect(a < mid).toBe(true);
    expect(mid < b).toBe(true);
  });

  it('refuses an inverted pair — a stale view of the order', () => {
    const a = rankBetween(null, null);
    const b = rankBetween(a, null);
    expect(() => rankBetween(b, a)).toThrow(RankError);
  });

  it('refuses equal endpoints', () => {
    const a = rankBetween(null, null);
    expect(() => rankBetween(a, a)).toThrow(RankError);
  });

  it('rejects ranks outside the alphabet', () => {
    expect(() => rankBetween('!!', null)).toThrow(RankError);
    expect(() => rankBetween('a b', null)).toThrow(RankError);
  });

  it('never returns a rank ending in the zero digit', () => {
    // A trailing zero cannot be subdivided below, so it would eventually wedge.
    const seen: string[] = [];
    let prev: string | null = null;
    for (let i = 0; i < 200; i++) {
      prev = rankBetween(prev, null);
      seen.push(prev);
    }
    for (const r of seen) expect(r.endsWith('0')).toBe(false);
  });
});

describe('the precision property that motivates strings', () => {
  it('survives 1000 consecutive inserts in the SAME gap', () => {
    // This is the case that breaks float ranks: doubles exhaust precision after
    // roughly 50 midpoints. Strings must simply grow.
    let lo = rankBetween(null, null);
    const hi = rankBetween(lo, null);
    const produced = new Set<string>();

    for (let i = 0; i < 1000; i++) {
      const mid = rankBetween(lo, hi);
      expect(lo < mid, `iteration ${i}: ${lo} < ${mid}`).toBe(true);
      expect(mid < hi, `iteration ${i}: ${mid} < ${hi}`).toBe(true);
      expect(produced.has(mid), `iteration ${i} produced a duplicate`).toBe(false);
      produced.add(mid);
      lo = mid;
    }
    expect(produced.size).toBe(1000);
  });

  it('keeps rank length sane under repeated same-gap inserts', () => {
    // Base 62 means length grows slowly — a practical column will not approach
    // the re-rank threshold.
    let lo = rankBetween(null, null);
    const hi = rankBetween(lo, null);
    for (let i = 0; i < 100; i++) lo = rankBetween(lo, hi);
    expect(lo.length).toBeLessThan(30);
  });

  it('survives 1000 consecutive PREPENDS', () => {
    let first = rankBetween(null, null);
    for (let i = 0; i < 1000; i++) {
      const next = rankBetween(null, first);
      expect(next < first).toBe(true);
      first = next;
    }
  });

  it('survives 1000 consecutive APPENDS', () => {
    let last = rankBetween(null, null);
    for (let i = 0; i < 1000; i++) {
      const next = rankBetween(last, null);
      expect(next > last).toBe(true);
      last = next;
    }
  });
});

describe('property: a randomly shuffled column stays consistently ordered', () => {
  it('holds over 500 random moves', () => {
    const rand = makeRandom(20260719);
    // Start with a column of cards.
    let cards = initialRanks(10).map((rank, i) => ({ id: `c${i}`, rank }));

    for (let move = 0; move < 500; move++) {
      cards.sort(compareRank);
      const from = Math.floor(rand() * cards.length);
      const to = Math.floor(rand() * (cards.length + 1));

      const moved = cards[from];
      const without = cards.filter((_, i) => i !== from);
      const before = to > 0 ? without[Math.min(to, without.length) - 1] : undefined;
      const after = to < without.length ? without[Math.min(to, without.length)] : undefined;

      if (before && after && before.rank >= after.rank) {
        throw new Error(`neighbours out of order at move ${move}`);
      }
      moved.rank = rankBetween(before?.rank ?? null, after?.rank ?? null);

      cards = [...without.slice(0, to), moved, ...without.slice(to)];

      // Invariant: after every move, ranks are strictly increasing in list order.
      for (let i = 1; i < cards.length; i++) {
        expect(
          cards[i - 1].rank < cards[i].rank,
          `move ${move}: ${cards[i - 1].rank} !< ${cards[i].rank}`,
        ).toBe(true);
      }
    }
  });
});

describe('initialRanks', () => {
  it('returns n strictly increasing ranks', () => {
    const r = initialRanks(25);
    expect(r).toHaveLength(25);
    for (let i = 1; i < r.length; i++) expect(r[i - 1] < r[i]).toBe(true);
  });

  it('handles zero and one', () => {
    expect(initialRanks(0)).toEqual([]);
    expect(initialRanks(1)).toHaveLength(1);
  });
});

describe('compareRank', () => {
  it('orders by rank', () => {
    expect(compareRank({ rank: 'A', id: 'z' }, { rank: 'B', id: 'a' })).toBeLessThan(0);
  });

  it('breaks ties on id, so the order is total and stable', () => {
    // Two clients CAN compute the same rank for the same gap. That is cosmetic,
    // not corruption — but the order must still be deterministic everywhere.
    expect(compareRank({ rank: 'A', id: 'a' }, { rank: 'A', id: 'b' })).toBeLessThan(0);
    expect(compareRank({ rank: 'A', id: 'b' }, { rank: 'A', id: 'a' })).toBeGreaterThan(0);
    expect(compareRank({ rank: 'A', id: 'a' }, { rank: 'A', id: 'a' })).toBe(0);
  });
});

describe('needsRerank / rerank', () => {
  it('flags duplicate ranks', () => {
    expect(needsRerank(['A', 'B', 'B'])).toBe(true);
  });

  it('flags over-long ranks', () => {
    expect(needsRerank(['A', 'B'.repeat(20)])).toBe(true);
  });

  it('leaves a healthy column alone', () => {
    expect(needsRerank(initialRanks(20))).toBe(false);
  });

  it('rerank preserves the visible order', () => {
    const cards = [
      { id: 'c1', rank: 'A' },
      { id: 'c2', rank: 'A' }, // tie, broken by id
      { id: 'c3', rank: 'B' },
    ];
    const updates = rerank(cards);
    const applied = cards
      .map((c) => ({ ...c, rank: updates.get(c.id) ?? c.rank }))
      .sort(compareRank);
    expect(applied.map((c) => c.id)).toEqual(['c1', 'c2', 'c3']);
    // And the result has no ties left.
    expect(new Set(applied.map((c) => c.rank)).size).toBe(3);
  });

  it('rerank returns only the cards that actually change', () => {
    const cards = initialRanks(5).map((rank, i) => ({ id: `c${i}`, rank }));
    expect(rerank(cards).size).toBe(0);
  });
});
