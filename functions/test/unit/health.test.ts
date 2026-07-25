import { describe, it, expect } from 'vitest';
import { evaluateCounts } from '../../src/health';
import { COLLECTIONS } from '@sabeel/shared';

// The alerting POLICY, exhaustively. `evaluateCounts` is pure so every rule can
// be pinned here without an emulator — the counting and the doc write are the
// only parts that need one (see test/integration/health.test.ts).
describe('evaluateCounts', () => {
  it('says nothing on the first ever run — there is no baseline to judge', () => {
    // Inventing a baseline would cry wolf on a database that is simply new.
    expect(evaluateCounts(null, { cards: 0, boards: 0 })).toEqual([]);
  });

  it('ignores a collection with no previous count (newly added to the inventory)', () => {
    expect(evaluateCounts({ cards: 10 }, { cards: 10, comments: 4 })).toEqual([]);
  });

  it('ignores growth and stasis', () => {
    expect(evaluateCounts({ cards: 10 }, { cards: 40 })).toEqual([]);
    expect(evaluateCounts({ cards: 10 }, { cards: 10 })).toEqual([]);
  });

  describe('zero-tolerance collections', () => {
    // These cannot shrink through normal use: the rules forbid the delete
    // outright (boards, activity) or it takes a deliberate admin action (users).
    for (const name of ['boards', 'activity', 'users']) {
      it(`flags a drop of even ONE ${name}`, () => {
        const findings = evaluateCounts({ [name]: 30 }, { [name]: 29 });
        expect(findings).toHaveLength(1);
        expect(findings[0]).toMatchObject({
          collection: name,
          previous: 30,
          current: 29,
          dropped: 1,
          allowed: 0,
        });
      });
    }
  });

  describe('tolerant collections', () => {
    it('absorbs routine tidying under the floor of 5', () => {
      // 100 -> 96 is a drop of 4: under the floor, so silent.
      expect(evaluateCounts({ cards: 100 }, { cards: 96 })).toEqual([]);
    });

    it('still absorbs a drop of exactly the allowance', () => {
      // max(5, floor(100 * 0.2)) = 20. Exactly 20 is tolerated; 21 is not.
      expect(evaluateCounts({ cards: 100 }, { cards: 80 })).toEqual([]);
      expect(evaluateCounts({ cards: 100 }, { cards: 79 })).toHaveLength(1);
    });

    it('uses the FLOOR on a small dataset, not the fraction', () => {
      // floor(10 * 0.2) = 2, but the floor of 5 wins — a tiny board losing 4
      // cards is normal tidying, not an incident.
      expect(evaluateCounts({ cards: 10 }, { cards: 6 })).toEqual([]);
      expect(evaluateCounts({ cards: 10 }, { cards: 4 })).toHaveLength(1);
    });

    it('uses the FRACTION once the collection is large', () => {
      // max(5, floor(1000 * 0.2)) = 200 — losing 50 of 1000 stays quiet.
      expect(evaluateCounts({ cards: 1000 }, { cards: 950 })).toEqual([]);
      expect(evaluateCounts({ cards: 1000 }, { cards: 799 })).toHaveLength(1);
    });

    it('reports the allowance alongside the drop, so the alert explains itself', () => {
      const [finding] = evaluateCounts({ comments: 200 }, { comments: 100 });
      expect(finding).toEqual({
        collection: 'comments',
        previous: 200,
        current: 100,
        dropped: 100,
        allowed: 40,
      });
    });

    it('catches a wipe of a tolerant collection', () => {
      const [finding] = evaluateCounts({ cards: 27 }, { cards: 0 });
      expect(finding).toMatchObject({ collection: 'cards', dropped: 27 });
    });
  });

  it('reports every offending collection at once', () => {
    const findings = evaluateCounts(
      { boards: 3, cards: 27, comments: 15, users: 5 },
      { boards: 0, cards: 0, comments: 15, users: 5 },
    );
    expect(findings.map((f) => f.collection).sort()).toEqual(['boards', 'cards']);
  });

  it('applies a default tolerance to a collection with no explicit rule', () => {
    // Adding a collection to COLLECTIONS without a DROP_RULES entry must not
    // silently disable alerting for it.
    const findings = evaluateCounts({ somethingNew: 100 }, { somethingNew: 50 });
    expect(findings).toHaveLength(1);
    expect(findings[0].allowed).toBe(20);
  });

  // Guards the two halves against drifting apart: every collection the canary
  // counts should have a considered tolerance, not fall through to the default.
  it('covers every collection in the inventory with an explicit rule', () => {
    const previous = Object.fromEntries(
      Object.keys(COLLECTIONS).map((name) => [name, 1000]),
    );
    const current = Object.fromEntries(
      Object.keys(COLLECTIONS).map((name) => [name, 0]),
    );
    const findings = evaluateCounts(previous, current);
    expect(findings.map((f) => f.collection).sort()).toEqual(
      Object.keys(COLLECTIONS).sort(),
    );
  });
});
