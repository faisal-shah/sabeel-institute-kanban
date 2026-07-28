import { describe, it, expect } from 'vitest';
import {
  activeMentionQuery,
  completeMention,
  extractMentions,
  handleFor,
  mentionSuggestions,
} from '../src/mentions';

const people = [
  { uid: 'u1', displayName: 'Sara Ahmed', email: 'sara@oursabeel.com' },
  { uid: 'u2', displayName: 'Faisal Shah', email: 'faisal@oursabeel.com' },
  { uid: 'u3', displayName: 'Sarah Khan', email: 'sarah@oursabeel.com' },
  { uid: 'u4', displayName: 'Omar Ali', email: 'omar.ali@oursabeel.com' },
];

describe('handleFor', () => {
  it('uses the email local part, lowercased', () => {
    expect(handleFor('Sara@OurSabeel.com')).toBe('sara');
    expect(handleFor('omar.ali@oursabeel.com')).toBe('omar.ali');
  });
});

describe('extractMentions', () => {
  it('finds a mention', () => {
    expect(extractMentions('hey @sara can you look?', people)).toEqual(['u1']);
  });

  it('finds several, without duplicates', () => {
    const found = extractMentions('@sara and @faisal and @sara again', people);
    expect(found.sort()).toEqual(['u1', 'u2']);
  });

  it('does not confuse @sara with @sarah', () => {
    // The bug that would quietly notify the wrong colleague.
    expect(extractMentions('@sarah please review', people)).toEqual(['u3']);
    expect(extractMentions('@sara please review', people)).toEqual(['u1']);
  });

  it('handles a handle containing a dot', () => {
    expect(extractMentions('cc @omar.ali', people)).toEqual(['u4']);
  });

  it('ignores trailing punctuation', () => {
    expect(extractMentions('thanks @sara!', people)).toEqual(['u1']);
    expect(extractMentions('thanks @sara, much appreciated', people)).toEqual(['u1']);
  });

  it('ignores unknown handles', () => {
    expect(extractMentions('@nobody here', people)).toEqual([]);
  });

  it('ignores an email address written in full', () => {
    // "mail sara@oursabeel.com" is not a mention of sara — there is no @handle
    // token at a word boundary.
    expect(extractMentions('mail sara@oursabeel.com about it', people)).toEqual([]);
  });

  it('returns nothing for text with no mentions', () => {
    expect(extractMentions('a plain comment', people)).toEqual([]);
  });
});

describe('mentionSuggestions', () => {
  it('offers everyone for an empty query', () => {
    expect(mentionSuggestions('', people)).toHaveLength(4);
  });

  it('matches on handle', () => {
    expect(mentionSuggestions('sar', people).map((p) => p.uid).sort()).toEqual([
      'u1',
      'u3',
    ]);
  });

  it('matches on display name', () => {
    expect(mentionSuggestions('khan', people).map((p) => p.uid)).toEqual(['u3']);
  });

  it('does not match the shared email DOMAIN, which would match everybody', () => {
    // Every account is @oursabeel.com. Matching the whole address meant that
    // typing `@o` — or s, e, a, u, r, b, l, c, m — returned all 13 people and
    // the list appeared not to narrow at all.
    for (const q of ['o', 'u', 'r', 'b', 'l', 'ours', 'oursabeel', '.com']) {
      expect(
        mentionSuggestions(q, people).length,
        `"${q}" must not match everyone`,
      ).toBeLessThan(people.length);
    }
    // The handle IS the local part, so nothing that mattered was lost.
    expect(mentionSuggestions('omar', people).map((p) => p.uid)).toEqual(['u4']);
  });

  it('ranks a match at the START above one in the middle', () => {
    // "@s" matches Sara Ahmed at the start and Faisal Shah in the middle
    // ("fai-s-al"). Alphabetical alone put Faisal first, which is not who you
    // meant. Both are still offered — surnames are a real way to search.
    expect(mentionSuggestions('s', people).map((p) => p.uid)).toEqual([
      'u1', // Sara Ahmed  — handle starts with s
      'u3', // Sarah Khan  — handle starts with s
      'u2', // Faisal Shah — "Shah" and "faisal" both contain s
    ]);
  });

  it('prefers the prioritised person even over a start-match', () => {
    // Being on the card outranks how well the letters line up.
    expect(mentionSuggestions('s', people, { prioritise: ['u2'] })[0].uid).toBe('u2');
  });

  it('is case-insensitive', () => {
    expect(mentionSuggestions('FAISAL', people).map((p) => p.uid)).toEqual(['u2']);
  });

  it('returns EVERY match, because the list scrolls', () => {
    // It used to stop at five. On a board carrying the whole organisation that
    // left people unreachable unless you guessed enough of a prefix — the
    // report this change came from.
    const many = Array.from({ length: 12 }, (_, i) => ({
      uid: `m${i}`,
      displayName: `Person ${String(i).padStart(2, '0')}`,
      email: `person${i}@oursabeel.com`,
    }));
    expect(mentionSuggestions('', many)).toHaveLength(12);
    expect(mentionSuggestions('person', many)).toHaveLength(12);
  });

  it('sorts by display name', () => {
    expect(mentionSuggestions('', people).map((p) => p.displayName)).toEqual([
      'Faisal Shah',
      'Omar Ali',
      'Sara Ahmed',
      'Sarah Khan',
    ]);
  });

  it('floats prioritised people to the top, each group alphabetical', () => {
    const out = mentionSuggestions('', people, { prioritise: ['u3', 'u4'] });
    expect(out.map((p) => p.uid)).toEqual([
      'u4', // Omar Ali     — on the card
      'u3', // Sarah Khan   — on the card
      'u2', // Faisal Shah
      'u1', // Sara Ahmed
    ]);
  });

  it('only REORDERS — a prioritised person who does not match stays out', () => {
    // Being on the card must not resurrect someone the query excludes, or
    // typing a name would start showing people who do not have it.
    const out = mentionSuggestions('khan', people, { prioritise: ['u1', 'u2'] });
    expect(out.map((p) => p.uid)).toEqual(['u3']);
  });

  it('prioritising someone absent from the candidates changes nothing', () => {
    const out = mentionSuggestions('', people, { prioritise: ['nobody'] });
    expect(out.map((p) => p.uid)).toEqual(['u2', 'u4', 'u1', 'u3']);
  });
});

describe('activeMentionQuery', () => {
  it('detects a mention being typed', () => {
    expect(activeMentionQuery('hey @sa')).toBe('sa');
    expect(activeMentionQuery('@')).toBe('');
  });

  it('returns null when the caret is not in a mention', () => {
    expect(activeMentionQuery('hey @sara ')).toBeNull();
    expect(activeMentionQuery('plain text')).toBeNull();
  });

  it('does not fire mid-word (an email address is not a mention)', () => {
    expect(activeMentionQuery('mail sara@ours')).toBeNull();
  });
});

describe('completeMention', () => {
  it('replaces the partial handle and adds a space', () => {
    expect(completeMention('hey @sa', '', people[0])).toBe('hey @sara ');
  });

  it('keeps text after the caret', () => {
    expect(completeMention('hey @sa', ' please look', people[0])).toBe(
      'hey @sara  please look',
    );
  });

  it('works at the very start', () => {
    expect(completeMention('@f', '', people[1])).toBe('@faisal ');
  });
});
