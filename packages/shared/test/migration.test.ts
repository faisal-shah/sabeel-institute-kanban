import { describe, it, expect } from 'vitest';
import {
  isAutoAcceptable,
  mapDueDate,
  mapPriority,
  matchPerson,
  matchStatus,
  normaliseName,
  sourceIdFor,
  validateMapping,
} from '../src/migration';

const members = [
  { email: 'sara@oursabeel.com', displayName: 'Sara Ahmed' },
  { email: 'faisal@oursabeel.com', displayName: 'Faisal Shah' },
  { email: 'omar.ali@oursabeel.com', displayName: 'Omar Ali' },
  { email: 'samir@oursabeel.com', displayName: 'Samir Khan' },
];

describe('matchPerson', () => {
  it('matches an exact email', () => {
    const m = matchPerson('sara@oursabeel.com', members);
    expect(m).toMatchObject({ email: 'sara@oursabeel.com', confidence: 'exact' });
  });

  it('matches a username against the email local part', () => {
    expect(matchPerson('faisal', members)).toMatchObject({
      email: 'faisal@oursabeel.com',
      confidence: 'exact',
    });
  });

  it('matches a display name, but only as LIKELY', () => {
    // Auto-accepting a name match is how work gets assigned to the wrong person.
    const m = matchPerson('Sara Ahmed', members);
    expect(m.email).toBe('sara@oursabeel.com');
    expect(m.confidence).toBe('likely');
    expect(isAutoAcceptable(m)).toBe(false);
  });

  it('ignores parenthetical asides in names', () => {
    expect(normaliseName('Omar (Design)')).toBe('omarali'.slice(0, 4));
    expect(matchPerson('Omar Ali (Design)', members).email).toBe(
      'omar.ali@oursabeel.com',
    );
  });

  it('NEVER auto-maps a foreign email onto an org account', () => {
    const m = matchPerson('sara@gmail.com', members);
    expect(m.email).toBeNull();
    expect(m.confidence).toBe('none');
  });

  it('refuses a prefix match rather than guessing', () => {
    // "sam" prefixes "Samir". Quietly assigning Samir's work to a "Sam" who may
    // not exist is precisely the silent damage this whole design avoids.
    const m = matchPerson('sam', members);
    expect(m.email).toBeNull();
    expect(m.confidence).toBe('weak');
    expect(m.note).toContain('samir@oursabeel.com');
    expect(isAutoAcceptable(m)).toBe(false);
  });

  it('refuses when several people match', () => {
    const ambiguous = [
      { email: 'a@oursabeel.com', displayName: 'Sara Ahmed' },
      { email: 'b@oursabeel.com', displayName: 'Sara Ahmed' },
    ];
    const m = matchPerson('Sara Ahmed', ambiguous);
    expect(m.email).toBeNull();
    expect(m.note).toContain('2');
  });

  it('returns none for an unknown person', () => {
    expect(matchPerson('Nobody At All', members)).toMatchObject({
      email: null,
      confidence: 'none',
    });
  });

  it('only auto-accepts exact matches', () => {
    expect(isAutoAcceptable({ confidence: 'exact' })).toBe(true);
    for (const c of ['likely', 'weak', 'none'] as const) {
      expect(isAutoAcceptable({ confidence: c })).toBe(false);
    }
  });
});

describe('matchStatus', () => {
  const columns = ['To Do', 'In Progress', 'Done'];

  it('matches an existing column exactly, case-insensitively', () => {
    expect(matchStatus('to do', columns)).toMatchObject({
      column: 'To Do',
      confidence: 'exact',
    });
  });

  it('maps common synonyms', () => {
    expect(matchStatus('Backlog', columns).column).toBe('To Do');
    expect(matchStatus('doing', columns).column).toBe('In Progress');
    expect(matchStatus('Closed', columns).column).toBe('Done');
  });

  it('keeps an unknown status as its OWN column rather than forcing a fit', () => {
    // Flattening "In Review" into "In Progress" loses information silently; an
    // extra column is visible and one click to merge.
    const m = matchStatus('In Review', columns);
    expect(m.column).toBe('In Review');
    expect(m.confidence).toBe('weak');
    expect(m.note).toContain('new column');
  });
});

describe('mapPriority', () => {
  it('maps words and ClickUp numbers', () => {
    expect(mapPriority('urgent')).toBe('urgent');
    expect(mapPriority(1)).toBe('urgent');
    expect(mapPriority('High')).toBe('high');
    expect(mapPriority(2)).toBe('high');
    expect(mapPriority('normal')).toBe('medium');
    expect(mapPriority(3)).toBe('medium');
    expect(mapPriority('low')).toBe('low');
    expect(mapPriority(4)).toBe('low');
  });

  it('falls back to none for blanks and nonsense', () => {
    for (const v of [null, undefined, '', 'whatever', 99]) {
      expect(mapPriority(v)).toBe('none');
    }
  });
});

describe('mapDueDate', () => {
  it('passes through a day key', () => {
    expect(mapDueDate('2026-07-19')).toBe('2026-07-19');
  });

  it('converts epoch milliseconds and seconds', () => {
    expect(mapDueDate(1784419200000)).toBe('2026-07-19');
    expect(mapDueDate('1784419200')).toBe('2026-07-19');
  });

  it('parses an ISO timestamp', () => {
    expect(mapDueDate('2026-07-19T14:30:00Z')).toBe('2026-07-19');
  });

  it('returns null rather than guessing at nonsense', () => {
    // A card with no due date is obviously missing one. A card with the WRONG
    // due date looks authoritative and misleads people.
    for (const v of [null, undefined, '', 'sometime next week', 'N/A']) {
      expect(mapDueDate(v)).toBeNull();
    }
  });
});

describe('sourceIdFor', () => {
  it('is stable and namespaced, so re-runs update rather than duplicate', () => {
    expect(sourceIdFor('abc123')).toBe('clickup:abc123');
    expect(sourceIdFor(' abc123 ')).toBe('clickup:abc123');
    expect(sourceIdFor('abc123')).toBe(sourceIdFor('abc123'));
  });
});

describe('validateMapping', () => {
  const good = {
    people: [{ clickup: 'sara', email: 'sara@oursabeel.com', confidence: 'exact' as const }],
    boards: [{ clickupList: 'Marketing 2025', boardName: 'Marketing' }],
    columns: [{ clickupStatus: 'to do', column: 'To Do', confidence: 'exact' as const }],
  };

  it('passes a complete mapping', () => {
    expect(validateMapping(good)).toEqual([]);
  });

  it('reports an unmapped person', () => {
    const problems = validateMapping({
      ...good,
      people: [{ clickup: 'omar', email: null, confidence: 'none', note: 'no match' }],
    });
    expect(problems).toHaveLength(1);
    expect(problems[0].kind).toBe('person');
  });

  it('rejects a person mapped to a non-org address', () => {
    const problems = validateMapping({
      ...good,
      people: [{ clickup: 'x', email: 'x@gmail.com', confidence: 'exact' }],
    });
    expect(problems[0].message).toContain('oursabeel.com');
  });

  it('reports an unmapped board or column', () => {
    expect(
      validateMapping({ ...good, boards: [{ clickupList: 'L', boardName: null }] }),
    ).toHaveLength(1);
    expect(
      validateMapping({
        ...good,
        columns: [{ clickupStatus: 's', column: null, confidence: 'none' }],
      }),
    ).toHaveLength(1);
  });

  it('reports every problem at once, not just the first', () => {
    const problems = validateMapping({
      people: [{ clickup: 'a', email: null, confidence: 'none' }],
      boards: [{ clickupList: 'b', boardName: null }],
      columns: [{ clickupStatus: 'c', column: null, confidence: 'none' }],
    });
    expect(problems).toHaveLength(3);
  });
});
