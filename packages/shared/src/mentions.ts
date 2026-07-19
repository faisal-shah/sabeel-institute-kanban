/**
 * @mention parsing for comments.
 *
 * Mentions are stored twice: as text inside the comment body, and as a
 * `mentionUids` array. The array is what rules validate and what notification
 * triggers read — parsing the body server-side on every write would be slower
 * and would have to agree exactly with the client's parser anyway.
 */

export interface MentionCandidate {
  uid: string;
  displayName: string;
  email: string;
}

/**
 * The handle shown in text. Derived from the email local part rather than the
 * display name, because names collide and contain spaces, and because everyone
 * already knows their own address.
 */
export function handleFor(email: string): string {
  const at = email.indexOf('@');
  return (at === -1 ? email : email.slice(0, at)).toLowerCase();
}

/** Everyone whose handle appears as `@handle` in the text. */
export function extractMentions(
  body: string,
  candidates: readonly MentionCandidate[],
): string[] {
  const found = new Set<string>();
  // A handle runs to the first character that cannot appear in an email local
  // part, so "@sara," and "@sara." resolve to sara.
  const tokens = body.match(/@[A-Za-z0-9._%+-]+/g) ?? [];

  for (const token of tokens) {
    const handle = token.slice(1).toLowerCase();
    for (const c of candidates) {
      const h = handleFor(c.email);
      // Trailing punctuation is not part of the handle: "@sara." matches sara,
      // but "@sarah" must NOT match sara.
      if (handle === h || handle.replace(/[.]+$/, '') === h) {
        found.add(c.uid);
      }
    }
  }

  return [...found];
}

/**
 * Candidates for the autocomplete, given what has been typed after the "@".
 * Matches on handle, display name or email so people can type whichever they
 * remember.
 */
export function mentionSuggestions(
  partial: string,
  candidates: readonly MentionCandidate[],
  limit = 5,
): MentionCandidate[] {
  const q = partial.toLowerCase().trim();
  if (q.length === 0) return candidates.slice(0, limit);

  return candidates
    .filter(
      (c) =>
        handleFor(c.email).includes(q) ||
        c.displayName.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q),
    )
    .slice(0, limit);
}

/**
 * The partial handle currently being typed, or null when the caret is not in a
 * mention. Used to decide whether to show the autocomplete at all.
 */
export function activeMentionQuery(textUpToCaret: string): string | null {
  const m = textUpToCaret.match(/(?:^|\s)@([A-Za-z0-9._%+-]*)$/);
  return m ? m[1] : null;
}

/** Replace the mention being typed with a complete handle. */
export function completeMention(
  textUpToCaret: string,
  rest: string,
  candidate: MentionCandidate,
): string {
  const replaced = textUpToCaret.replace(
    /(^|\s)@([A-Za-z0-9._%+-]*)$/,
    `$1@${handleFor(candidate.email)} `,
  );
  return replaced + rest;
}
