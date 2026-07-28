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
 *
 * Matches on the HANDLE and the display name — deliberately not the whole email.
 * Every account is on one domain, so matching the full address meant every
 * letter of "oursabeel.com" matched everybody: typing `@o`, `@s`, `@e`, `@a`,
 * `@u`, `@r`, `@b`, `@l`, `@c` or `@m` narrowed nothing at all. The handle IS
 * the local part, so nothing is lost.
 *
 * EVERY match is returned. This used to stop at five, which on a board with the
 * whole organisation on it meant eight people were unreachable unless you
 * guessed enough of a prefix — a silent cap the reader has no way to notice.
 * The list scrolls now, so there is nothing to cap.
 *
 * `prioritise` floats people already on the card to the top, each group sorted
 * by display name. With a small organisation that is usually the whole fix: the
 * person you want is the first row rather than somewhere in a scroll. It only
 * REORDERS — someone who does not match the query is not resurrected by being
 * on the card.
 */
export function mentionSuggestions(
  partial: string,
  candidates: readonly MentionCandidate[],
  opts: { prioritise?: readonly string[] } = {},
): MentionCandidate[] {
  const q = partial.toLowerCase().trim();
  const matches =
    q.length === 0
      ? [...candidates]
      : candidates.filter(
          (c) =>
            handleFor(c.email).includes(q) || c.displayName.toLowerCase().includes(q),
        );

  // A match ANYWHERE counts — people search by surname — but a match at the
  // START is almost always the one meant. Without this, typing "@s" put Faisal
  // above Sara, because "fai-s-al" matches and F sorts first.
  const startsWith = (c: MentionCandidate) =>
    q.length > 0 &&
    (handleFor(c.email).startsWith(q) || c.displayName.toLowerCase().startsWith(q));

  const top = new Set(opts.prioritise ?? []);
  return matches.sort((a, b) => {
    const aTop = top.has(a.uid);
    const bTop = top.has(b.uid);
    if (aTop !== bTop) return aTop ? -1 : 1;
    const aPre = startsWith(a);
    const bPre = startsWith(b);
    if (aPre !== bPre) return aPre ? -1 : 1;
    return a.displayName.localeCompare(b.displayName);
  });
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
