/**
 * Fractional string ranks — the ordering primitive for cards.
 *
 * A card's position is a single string. To move a card you write ONE field on
 * ONE document: `{ columnId, rank }`. Two people dragging in the same column
 * touch different documents and both succeed. The alternative — an array of card
 * ids on the board — makes every reorder a write to one hot document, so
 * simultaneous drags overwrite each other and moves are silently lost.
 *
 * Why strings rather than floats: doubles run out of precision after roughly 50
 * consecutive inserts at the same position, which a busy column genuinely
 * reaches; a string can always be subdivided. See docs/PRODUCT_BRIEF.md.
 *
 * The algorithm is the well-established "fractional indexing" midpoint: treat
 * ranks as base-62 fractions and return a value strictly between two others.
 *
 * DIGITS are in ASCII order (0-9 < A-Z < a-z), which is what makes plain
 * lexicographic comparison — and therefore Firestore's `orderBy('rank')` — agree
 * with numeric order. Changing this string reorders every existing board.
 */
const DIGITS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const ZERO = DIGITS[0];

export class RankError extends Error {}

/**
 * Ranks never end in the zero digit. A trailing zero has no effect on ordering
 * but leaves no room to subdivide below it, so the invariant keeps every rank
 * splittable forever. Every value this module returns satisfies it.
 */
function assertValidRank(r: string, label: string): void {
  if (r.length === 0) throw new RankError(`${label} must not be empty`);
  for (const ch of r) {
    if (DIGITS.indexOf(ch) === -1) {
      throw new RankError(`${label} contains a character outside the rank alphabet`);
    }
  }
  if (r.endsWith(ZERO)) {
    throw new RankError(`${label} must not end in '${ZERO}'`);
  }
}

function midpoint(a: string, b: string | undefined): string {
  if (b !== undefined && a >= b) {
    throw new RankError(`cannot find a rank between ${a} and ${b}`);
  }

  if (b !== undefined) {
    // Strip the shared prefix, then subdivide the remainder. Padding `a` with
    // zeros lets a shorter `a` be compared against a longer `b`.
    let n = 0;
    while ((a[n] ?? ZERO) === b[n]) n++;
    if (n > 0) return b.slice(0, n) + midpoint(a.slice(n), b.slice(n));
  }

  const digitA = a ? DIGITS.indexOf(a[0]) : 0;
  const digitB = b !== undefined ? DIGITS.indexOf(b[0]) : DIGITS.length;

  if (digitB - digitA > 1) {
    // Room between the digits: take the middle one and stop.
    return DIGITS[Math.round(0.5 * (digitA + digitB))];
  }

  // The digits are adjacent, so we must go one place deeper.
  if (b !== undefined && b.length > 1) {
    return b.slice(0, 1);
  }
  // `b` is absent or a single digit: keep `a`'s digit and subdivide what follows.
  return DIGITS[digitA] + midpoint(a.slice(1), undefined);
}

/**
 * A rank strictly between `before` and `after`. Pass `null` for either end to
 * mean "nothing there" — so `rankBetween(null, null)` is the first card in an
 * empty column, `rankBetween(null, first)` prepends, and `rankBetween(last,
 * null)` appends.
 *
 * Throws if `before >= after`, which means the caller's view of the order is
 * stale — better to fail loudly than to write a rank that sorts somewhere
 * surprising.
 */
export function rankBetween(before: string | null, after: string | null): string {
  if (before !== null) assertValidRank(before, 'before');
  if (after !== null) assertValidRank(after, 'after');
  if (before !== null && after !== null && before >= after) {
    throw new RankError(`before (${before}) must sort before after (${after})`);
  }
  return midpoint(before ?? '', after ?? undefined);
}

/** `n` evenly spread ranks, for seeding a column (or an import). */
export function initialRanks(n: number): string[] {
  const out: string[] = [];
  let prev: string | null = null;
  for (let i = 0; i < n; i++) {
    prev = rankBetween(prev, null);
    out.push(prev);
  }
  return out;
}

/**
 * Sort comparator for cards. Ranks are compared lexicographically; ties break on
 * id so the order is total and stable.
 *
 * Ties are possible: two clients can independently compute the same rank for the
 * same gap. That is cosmetic, not corruption — the cards simply sit in id order
 * — and `needsRerank` spots it so a column can be quietly rebuilt.
 */
export function compareRank(
  a: { rank: string; id: string },
  b: { rank: string; id: string },
): number {
  if (a.rank < b.rank) return -1;
  if (a.rank > b.rank) return 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * True when a column should be re-ranked: duplicate ranks, or ranks that have
 * grown long enough that repeated inserts in one spot are getting expensive.
 * Re-ranking is a background tidy-up, never something a user waits for.
 */
export function needsRerank(ranks: readonly string[], maxLength = 12): boolean {
  if (ranks.length !== new Set(ranks).size) return true;
  return ranks.some((r) => r.length > maxLength);
}

/** Fresh, evenly spread ranks for an existing ordering. */
export function rerank<T extends { id: string; rank: string }>(cards: readonly T[]): Map<string, string> {
  const ordered = [...cards].sort(compareRank);
  const fresh = initialRanks(ordered.length);
  const out = new Map<string, string>();
  ordered.forEach((c, i) => {
    if (c.rank !== fresh[i]) out.set(c.id, fresh[i]);
  });
  return out;
}
