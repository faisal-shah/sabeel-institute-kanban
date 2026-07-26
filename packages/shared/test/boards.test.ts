import { describe, it, expect } from 'vitest';
import {
  BOARD_NAME_MAX,
  COLUMN_NAME_MAX,
  LABEL_COLORS,
  columnDeleteBlocked,
  columnsPatch,
  defaultColumns,
  newBoard,
  newLabel,
  pushRecent,
  renameColumn,
  sortBoardsForList,
  validateBoardName,
  validateColumnName,
  validateLabelName,
  LABEL_NAME_MAX,
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

  it('rejects an empty or over-long label name', () => {
    expect(validateLabelName('', [])).not.toBeNull();
    expect(validateLabelName('   ', [])).not.toBeNull();
    expect(validateLabelName('donor-facing', [])).toBeNull();
    expect(validateLabelName('x'.repeat(LABEL_NAME_MAX), [])).toBeNull();
    expect(validateLabelName('x'.repeat(LABEL_NAME_MAX + 1), [])).not.toBeNull();
  });

  it('measures the label name AFTER trimming', () => {
    // The field caps raw input, so an at-the-limit name padded with spaces is
    // the shape that would otherwise be rejected for being one over.
    expect(validateLabelName(`  ${'x'.repeat(LABEL_NAME_MAX)}  `, [])).toBeNull();
  });

  it('rejects a duplicate label name, case-insensitively', () => {
    // Two chips reading "Urgent" and "urgent" are indistinguishable on a card
    // face, so the pair is unusable rather than merely untidy.
    const labels = [{ id: 'l1', name: 'Urgent', color: '#83114F' }];
    expect(validateLabelName('urgent', labels)).not.toBeNull();
    expect(validateLabelName('  URGENT  ', labels)).not.toBeNull();
    expect(validateLabelName('Urgent', labels)).not.toBeNull();
    expect(validateLabelName('donor-facing', labels)).toBeNull();
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

describe('columnsPatch', () => {
  // The invariant: columnIds must always be exactly the ids of columns, in order.
  // firestore.rules validates card writes against columnIds, so a desynced pair
  // would reject valid cards or accept invented columns.
  it('derives columnIds as the columns ids, in order', () => {
    const columns = [
      { id: 'c1', name: 'To Do' },
      { id: 'c3', name: 'Doing' },
      { id: 'c2', name: 'Done' },
    ];
    expect(columnsPatch(columns)).toEqual({
      columns,
      columnIds: ['c1', 'c3', 'c2'],
    });
  });

  it('handles an empty column list', () => {
    expect(columnsPatch([])).toEqual({ columns: [], columnIds: [] });
  });

  it('keeps columnIds in sync after a column is removed', () => {
    const columns = [
      { id: 'c1', name: 'To Do' },
      { id: 'c2', name: 'Done' },
    ];
    const { columnIds } = columnsPatch(columns.filter((c) => c.id !== 'c1'));
    expect(columnIds).toEqual(['c2']);
  });
});

describe('newLabel', () => {
  it('trims the name and keeps the given colour', () => {
    const label = newLabel('  Urgent  ', '#83114F');
    expect(label.name).toBe('Urgent');
    expect(label.color).toBe('#83114F');
  });

  it('assigns an id with the lbl prefix', () => {
    expect(newLabel('x', '#000000').id).toMatch(/^lbl_/);
  });

  it('gives two labels distinct ids', () => {
    expect(newLabel('a', '#000000').id).not.toBe(newLabel('a', '#000000').id);
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

describe('renameColumn', () => {
  const cols = () => [
    { id: 'c1', name: 'To Do' },
    { id: 'c2', name: 'In Progress' },
    { id: 'c3', name: 'Done' },
  ];

  it('renames the target and leaves the others alone', () => {
    const r = renameColumn(cols(), 'c2', 'Doing');
    expect(r.ok).toBe(true);
    expect(r.ok && r.columns).toEqual([
      { id: 'c1', name: 'To Do' },
      { id: 'c2', name: 'Doing' },
      { id: 'c3', name: 'Done' },
    ]);
  });

  it('trims', () => {
    const r = renameColumn(cols(), 'c1', '  Backlog  ');
    expect(r.ok && r.columns[0].name).toBe('Backlog');
  });

  // The whole reason this helper exists: the column being renamed is itself in
  // the list, so a naive duplicate check rejects its own name.
  it('accepts re-saving a column with the name it already has', () => {
    expect(renameColumn(cols(), 'c1', 'To Do').ok).toBe(true);
  });

  it('accepts a CASE-ONLY change, which a naive check would reject', () => {
    const r = renameColumn(cols(), 'c1', 'TO DO');
    expect(r.ok).toBe(true);
    expect(r.ok && r.columns[0].name).toBe('TO DO');
  });

  it('still rejects colliding with a DIFFERENT column, case-insensitively', () => {
    for (const name of ['Done', 'done']) {
      const r = renameColumn(cols(), 'c1', name);
      expect(r.ok).toBe(false);
      expect(!r.ok && r.error).toBe('There is already a column with that name.');
    }
  });

  it('rejects an empty or whitespace-only name', () => {
    const r = renameColumn(cols(), 'c1', '   ');
    expect(!r.ok && r.error).toBe('Give the column a name.');
  });

  it('rejects an over-long name', () => {
    const r = renameColumn(cols(), 'c1', 'x'.repeat(COLUMN_NAME_MAX + 1));
    expect(!r.ok && r.error).toContain(`under ${COLUMN_NAME_MAX}`);
  });

  it('returns columns that survive columnsPatch with ids intact', () => {
    // Renaming must never desync columns from columnIds — rules validate card
    // writes against the flat mirror.
    const r = renameColumn(cols(), 'c2', 'Doing');
    expect(r.ok && columnsPatch(r.columns).columnIds).toEqual(['c1', 'c2', 'c3']);
  });

  it('is a no-op for an unknown column id', () => {
    const r = renameColumn(cols(), 'nope', 'Whatever');
    expect(r.ok && r.columns).toEqual(cols());
  });
});

describe('columnDeleteBlocked', () => {
  it('allows deleting an empty column', () => {
    expect(columnDeleteBlocked('To Do', 0)).toBeNull();
  });

  it('blocks a column that still holds cards, and says how many', () => {
    expect(columnDeleteBlocked('To Do', 3)).toContain('still has 3 cards');
  });

  it('singularises one card', () => {
    const msg = columnDeleteBlocked('To Do', 1)!;
    expect(msg).toContain('still has 1 card.');
    expect(msg).not.toContain('1 cards');
  });

  it('names the column so the message is actionable', () => {
    expect(columnDeleteBlocked('Waiting on donor', 2)).toContain('Waiting on donor');
  });
});
