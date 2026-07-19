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

  it('is case-insensitive', () => {
    expect(mentionSuggestions('FAISAL', people).map((p) => p.uid)).toEqual(['u2']);
  });

  it('respects the limit', () => {
    expect(mentionSuggestions('', people, 2)).toHaveLength(2);
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
