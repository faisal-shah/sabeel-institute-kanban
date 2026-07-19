import { describe, it, expect } from 'vitest';
import {
  BOARD_NAME_MAX,
  LABEL_COLORS,
  defaultColumns,
  newBoard,
  pushRecent,
  sortBoardsForList,
  validateBoardName,
  validateColumnName,
} from '../src/boards';

describe('newBoard', () => {
  it('always includes the creator as a member', () => {
    // A board nobody can see is a support ticket.
    const b = newBoard({ name: 'Ops', createdBy: 'u1', now: 1 });
    expect(b.memberUids).toEqual(['u1']);
  });

  it('starts with the three default columns', () => {
    const b = newBoard({ name: 'Ops', createdBy: 'u1', now: 1 });
    expect(b.columns.map((c) => c.name)).toEqual(['To Do', 'In Progress', 'Done']);
  });

  it('gives every default column a distinct id', () => {
    const ids = defaultColumns().map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('trims the name and description', () => {
    const b = newBoard({ name: '  Ops  ', description: '  x  ', createdBy: 'u1', now: 1 });
    expect(b.name).toBe('Ops');
    expect(b.description).toBe('x');
  });

  it('is never born archived', () => {
    expect(newBoard({ name: 'Ops', createdBy: 'u1', now: 1 }).archived).toBe(false);
  });
});

describe('validation', () => {
  it('rejects an empty or whitespace name', () => {
    expect(validateBoardName('')).not.toBeNull();
    expect(validateBoardName('   ')).not.toBeNull();
  });

  it('accepts a normal name', () => {
    expect(validateBoardName('Fundraising 2026')).toBeNull();
  });

  it('rejects an over-long name', () => {
    expect(validateBoardName('x'.repeat(BOARD_NAME_MAX + 1))).not.toBeNull();
    expect(validateBoardName('x'.repeat(BOARD_NAME_MAX))).toBeNull();
  });

  it('rejects a duplicate column name, case-insensitively', () => {
    const cols = [{ id: 'c1', name: 'To Do' }];
    expect(validateColumnName('to do', cols)).not.toBeNull();
    expect(validateColumnName('  TO DO  ', cols)).not.toBeNull();
    expect(validateColumnName('Blocked', cols)).toBeNull();
  });
});

describe('label colours', () => {
  it('offers a fixed palette rather than a free picker', () => {
    // Free colour choice guarantees someone picks pale yellow and it disappears
    // in light mode. The palette is chosen to hold on both backgrounds.
    expect(LABEL_COLORS.length).toBeGreaterThan(4);
    for (const c of LABEL_COLORS) expect(c).toMatch(/^#[0-9A-F]{6}$/i);
  });
});

describe('sortBoardsForList', () => {
  const boards = [
    { id: 'b1', name: 'Zebra' },
    { id: 'b2', name: 'Apple' },
    { id: 'b3', name: 'Mango' },
    { id: 'b4', name: 'Banana' },
  ];

  it('puts favourites first, alphabetically', () => {
    const { favourites } = sortBoardsForList(boards, ['b1', 'b2'], []);
    expect(favourites.map((b) => b.name)).toEqual(['Apple', 'Zebra']);
  });

  it('orders recents most-recent-first, not alphabetically', () => {
    const { recents } = sortBoardsForList(boards, [], ['b3', 'b4']);
    expect(recents.map((b) => b.name)).toEqual(['Mango', 'Banana']);
  });

  it('never repeats a board across sections', () => {
    const { favourites, recents, others } = sortBoardsForList(
      boards,
      ['b1'],
      ['b1', 'b2'],
    );
    const all = [...favourites, ...recents, ...others].map((b) => b.id);
    expect(new Set(all).size).toBe(all.length);
    expect(all.sort()).toEqual(['b1', 'b2', 'b3', 'b4']);
  });

  it('a favourite outranks its recent entry', () => {
    const { favourites, recents } = sortBoardsForList(boards, ['b1'], ['b1']);
    expect(favourites.map((b) => b.id)).toEqual(['b1']);
    expect(recents).toEqual([]);
  });

  it('sorts the remainder alphabetically', () => {
    const { others } = sortBoardsForList(boards, [], []);
    expect(others.map((b) => b.name)).toEqual(['Apple', 'Banana', 'Mango', 'Zebra']);
  });

  it('ignores favourite/recent ids for boards that are gone', () => {
    const { favourites, recents } = sortBoardsForList(boards, ['deleted'], ['gone']);
    expect(favourites).toEqual([]);
    expect(recents).toEqual([]);
  });
});

describe('pushRecent', () => {
  it('puts the board first', () => {
    expect(pushRecent(['a', 'b'], 'c', 10)).toEqual(['c', 'a', 'b']);
  });

  it('de-duplicates rather than growing', () => {
    expect(pushRecent(['a', 'b', 'c'], 'b', 10)).toEqual(['b', 'a', 'c']);
  });

  it('caps the list', () => {
    expect(pushRecent(['a', 'b', 'c'], 'd', 3)).toEqual(['d', 'a', 'b']);
  });
});
