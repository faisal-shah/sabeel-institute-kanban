import { describe, it, expect, beforeEach } from 'vitest';
import {
  EMPTY_SEARCH_FILTERS,
  clearSearchFilters,
  getSearchFilters,
  labelChips,
  setSearchFilters,
} from './searchFilters';

/**
 * The store behind Search, tested without React.
 *
 * The reason it exists at all is that `App.tsx` renders one screen per route, so
 * opening a card unmounts `SearchScreen` and anything held in `useState` dies.
 * These cover the two things that can go wrong in a store like this: losing a
 * change, and losing the ability to reset.
 */
beforeEach(() => clearSearchFilters());

describe('setSearchFilters', () => {
  it('merges rather than replacing', () => {
    setSearchFilters({ text: 'budget' });
    setSearchFilters({ boardId: 'b2' });
    const seen = getSearchFilters();
    expect(seen.text).toBe('budget');
    expect(seen.boardId).toBe('b2');
  });

  it('a FUNCTIONAL patch sees every earlier change, even in one tick', () => {
    // The bug this form exists for. A chip handler closes over the value from
    // its own render, so two taps landing before React re-renders both compute
    // from the same snapshot and one is silently lost. Two toggles in a row here
    // stand in for two taps inside one batch.
    setSearchFilters({ archivedOnly: false });
    setSearchFilters((f) => ({ archivedOnly: !f.archivedOnly }));
    setSearchFilters((f) => ({ archivedOnly: !f.archivedOnly }));
    const seen = getSearchFilters();
    // Two toggles from false is false. Reading a stale snapshot would leave it
    // true — one tap's worth of work thrown away.
    expect(seen.archivedOnly).toBe(false);
  });

  it('accumulates labels without dropping one', () => {
    setSearchFilters((f) => ({ labelIds: [...f.labelIds, 'l1'] }));
    setSearchFilters((f) => ({ labelIds: [...f.labelIds, 'l2'] }));
    setSearchFilters((f) => ({ labelIds: f.labelIds.filter((id) => id !== 'l1') }));
    const seen = getSearchFilters();
    expect(seen.labelIds).toEqual(['l2']);
  });

});

describe('clearSearchFilters', () => {
  it('resets everything, which is what the clear control promises', () => {
    setSearchFilters({
      text: 'x',
      archivedOnly: true,
      overdueOnly: true,
      priority: 'urgent',
      labelIds: ['l1'],
      boardId: 'b1',
    });
    clearSearchFilters();
    const seen = getSearchFilters();
    expect(seen).toEqual(EMPTY_SEARCH_FILTERS);
  });
});

describe('labelChips', () => {
  const byName = <T extends { name: string }>(ls: T[]) =>
    [...ls].sort((a, b) => a.name.localeCompare(b.name));
  const labels = [
    { id: 'l1', name: 'Finance' },
    { id: 'l2', name: 'Admin' },
  ];

  it('resolves chosen ids to names, sorted', () => {
    expect(labelChips(['l1', 'l2'], labels, byName)).toEqual([
      { id: 'l2', name: 'Admin' },
      { id: 'l1', name: 'Finance' },
    ]);
  });

  it('STILL yields a chip for an id whose label was deleted', () => {
    // The whole point. A manager can delete a label someone is filtering by;
    // building chips by filtering the org-wide set down to the chosen ids meant
    // a dead id produced no chip while still narrowing the results — Search went
    // empty with no cause on screen and nothing to tap.
    const chips = labelChips(['l1', 'gone'], labels, byName);
    expect(chips).toHaveLength(2);
    expect(chips.map((c) => c.id)).toContain('gone');
  });

  it('keeps the dead id itself, so tapping the chip can remove it', () => {
    // A chip that cannot identify its own filter is decoration, not an escape.
    const [chip] = labelChips(['gone'], labels, byName);
    expect(chip).toEqual({ id: 'gone', name: 'Deleted label' });
  });

  it('is empty when nothing is chosen', () => {
    expect(labelChips([], labels, byName)).toEqual([]);
  });
});
