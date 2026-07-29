import { describe, it, expect } from 'vitest';
import {
  filterCards,
  hasActiveFilters,
  matchesText,
  rankMatches,
  type SearchableCard,
} from '../src/search';

const card = (over: Partial<SearchableCard> = {}): SearchableCard => ({
  id: 'c1',
  boardId: 'b1',
  title: 'Fix signup flow',
  description: 'The email step fails',
  columnId: 'todo',
  assigneeUids: [],
  labelIds: [],
  priority: 'none',
  archived: false,
  ...over,
});

const TODAY = '2026-07-19';

describe('matchesText', () => {
  it('matches the title, case-insensitively', () => {
    expect(matchesText(card(), 'SIGNUP')).toBe(true);
  });

  it('matches the description', () => {
    expect(matchesText(card(), 'email step')).toBe(true);
  });

  it('does not match unrelated text', () => {
    expect(matchesText(card(), 'newsletter')).toBe(false);
  });

  it('an empty query matches everything', () => {
    expect(matchesText(card(), '   ')).toBe(true);
  });
});

describe('filterCards', () => {
  const cards = [
    card({ id: 'a', title: 'Alpha', assigneeUids: ['u1'], priority: 'high' }),
    card({ id: 'b', title: 'Beta', labelIds: ['l1'], dueDate: '2026-07-18' }),
    card({ id: 'c', title: 'Gamma', labelIds: ['l2'], dueDate: TODAY }),
    card({ id: 'd', title: 'Delta', archived: true }),
    card({ id: 'e', title: 'Epsilon', dueDate: '2026-08-01' }),
  ];

  it('narrows to one board, and absent means every board', () => {
    const mixed = [
      card({ id: 'x', boardId: 'b1' }),
      card({ id: 'y', boardId: 'b2' }),
      card({ id: 'z', boardId: 'b2' }),
    ];
    expect(filterCards(mixed, { boardId: 'b2' }, TODAY).map((c) => c.id)).toEqual(['y', 'z']);
    // Absent is not "no results" — it is every board you can see.
    expect(filterCards(mixed, {}, TODAY)).toHaveLength(3);
  });

  it('composes with the other filters rather than replacing them', () => {
    // The board is one more narrowing, not a mode. If it replaced the rest,
    // this would return both cards on b2.
    const mixed = [
      card({ id: 'x', boardId: 'b2', title: 'Budget', priority: 'high' }),
      card({ id: 'y', boardId: 'b2', title: 'Newsletter', priority: 'none' }),
      card({ id: 'z', boardId: 'b1', title: 'Budget', priority: 'high' }),
    ];
    expect(
      filterCards(mixed, { boardId: 'b2', text: 'budget', priority: 'high' }, TODAY).map(
        (c) => c.id,
      ),
    ).toEqual(['x']);
  });

  it('still hides the archive when a board is chosen', () => {
    // Board narrows WITHIN the live set; it must not drag archived cards in.
    const mixed = [
      card({ id: 'live', boardId: 'b2' }),
      card({ id: 'old', boardId: 'b2', archived: true }),
    ];
    expect(filterCards(mixed, { boardId: 'b2' }, TODAY).map((c) => c.id)).toEqual(['live']);
    expect(
      filterCards(mixed, { boardId: 'b2', archivedOnly: true }, TODAY).map((c) => c.id),
    ).toEqual(['old']);
  });

  it('hides archived cards by default', () => {
    // The archive is a separate place, not something that pollutes results.
    expect(filterCards(cards, {}, TODAY).map((c) => c.id)).not.toContain('d');
  });

  it('shows ONLY archived when asked — it narrows, like every other chip', () => {
    // Regression: this used to ADD the archive to the live results, so turning
    // the chip on made the list LONGER (63 -> 67, with the same live cards still
    // on top). Sitting beside Overdue/Urgent/High, which all narrow, that read
    // as a bug you could only notice by counting rows.
    const ids = filterCards(cards, { archivedOnly: true }, TODAY).map((c) => c.id);
    expect(ids).toContain('d');
    // Every live card is gone, not merely outnumbered.
    const live = cards.filter((c) => !c.archived).map((c) => c.id);
    for (const id of live) expect(ids).not.toContain(id);
  });

  it('filters by assignee', () => {
    expect(filterCards(cards, { assigneeUid: 'u1' }, TODAY).map((c) => c.id)).toEqual([
      'a',
    ]);
  });

  it('filters by label', () => {
    expect(filterCards(cards, { labelIds: ['l1'] }, TODAY).map((c) => c.id)).toEqual(['b']);
  });

  it('matches ANY of several labels, not all of them', () => {
    // Requiring every label would be useless at this size — few cards carry two
    // SPECIFIC labels, so a second pick would almost always empty the list.
    expect(filterCards(cards, { labelIds: ['l1', 'l2'] }, TODAY).map((c) => c.id)).toEqual([
      'b',
      'c',
    ]);
  });

  it('treats an empty label list as no filter at all', () => {
    expect(filterCards(cards, { labelIds: [] }, TODAY)).toHaveLength(
      filterCards(cards, {}, TODAY).length,
    );
  });

  it('returns nothing for a label no card carries', () => {
    expect(filterCards(cards, { labelIds: ['nope'] }, TODAY)).toEqual([]);
  });

  it('filters by priority', () => {
    expect(filterCards(cards, { priority: 'high' }, TODAY).map((c) => c.id)).toEqual([
      'a',
    ]);
  });

  it('filters overdue', () => {
    expect(filterCards(cards, { due: 'overdue' }, TODAY).map((c) => c.id)).toEqual(['b']);
  });

  it('filters due today', () => {
    expect(filterCards(cards, { due: 'today' }, TODAY).map((c) => c.id)).toEqual(['c']);
  });

  it('filters cards with no due date', () => {
    expect(filterCards(cards, { due: 'none' }, TODAY).map((c) => c.id).sort()).toEqual([
      'a',
    ]);
  });

  it('combines filters', () => {
    expect(
      filterCards(cards, { text: 'alpha', priority: 'high' }, TODAY).map((c) => c.id),
    ).toEqual(['a']);
    expect(
      filterCards(cards, { text: 'alpha', priority: 'low' }, TODAY),
    ).toHaveLength(0);
  });

  it('returns everything with no filters', () => {
    expect(filterCards(cards, {}, TODAY)).toHaveLength(4); // archived excluded
  });
});

describe('hasActiveFilters', () => {
  it('is false for an empty filter set', () => {
    expect(hasActiveFilters({})).toBe(false);
    expect(hasActiveFilters({ text: '   ', due: 'any' })).toBe(false);
    // An EMPTY label list is not a filter — otherwise clearing the last chip
    // would leave the screen insisting something is still narrowing.
    expect(hasActiveFilters({ labelIds: [] })).toBe(false);
  });

  it('is true when anything narrows', () => {
    expect(hasActiveFilters({ text: 'x' })).toBe(true);
    expect(hasActiveFilters({ assigneeUid: 'u1' })).toBe(true);
    expect(hasActiveFilters({ due: 'overdue' })).toBe(true);
    expect(hasActiveFilters({ archivedOnly: true })).toBe(true);
    expect(hasActiveFilters({ labelIds: ['l1'] })).toBe(true);
  });
});

describe('hasActiveFilters', () => {
  it('counts a board filter — it is what shows the clear button', () => {
    expect(hasActiveFilters({})).toBe(false);
    expect(hasActiveFilters({ boardId: 'b2' })).toBe(true);
  });
});

describe('rankMatches', () => {
  it('puts a title prefix first, then title contains, then description only', () => {
    const cards = [
      card({ id: 'desc', title: 'Zebra', description: 'about signup' }),
      card({ id: 'contains', title: 'Fix signup flow', description: '' }),
      card({ id: 'prefix', title: 'signup broken', description: '' }),
    ];
    expect(rankMatches(cards, 'signup').map((c) => c.id)).toEqual([
      'prefix',
      'contains',
      'desc',
    ]);
  });

  it('is stable and alphabetical within a tier', () => {
    const cards = [
      card({ id: 'b', title: 'signup beta' }),
      card({ id: 'a', title: 'signup alpha' }),
    ];
    expect(rankMatches(cards, 'signup').map((c) => c.id)).toEqual(['a', 'b']);
  });

  it('leaves order alone for an empty query', () => {
    const cards = [card({ id: 'x' }), card({ id: 'y' })];
    expect(rankMatches(cards, '').map((c) => c.id)).toEqual(['x', 'y']);
  });
});
