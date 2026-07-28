import type { Priority } from './types';

/**
 * Card search and filtering, done on the CLIENT.
 *
 * Firestore has no full-text search. The alternative — Algolia or Typesense —
 * means a third-party service, a sync pipeline, another account and ongoing
 * cost, which is exactly the machinery this project exists to avoid. At this
 * team's scale (under 50 people, a few thousand cards) matching in memory over
 * the boards you belong to is instant, works offline over cached boards, and
 * costs nothing.
 *
 * Honest limits, stated so nobody is surprised: substring matching only, no
 * stemming and no fuzzy spelling. Revisit past roughly 10,000 cards — at that
 * point the answer is a real search service, not a cleverer client.
 */

export interface SearchableCard {
  id: string;
  boardId: string;
  title: string;
  description: string;
  columnId: string;
  assigneeUids: string[];
  labelIds: string[];
  priority: Priority;
  dueDate?: string;
  archived: boolean;
  /** Only used to order the BROWSE view (newest first). Optional so callers that
   *  only ever search by text need not carry it. */
  updatedAt?: number;
}

export interface CardFilters {
  text?: string;
  assigneeUid?: string;
  /**
   * Match a card carrying ANY of these labels. Empty or absent means no label
   * filter at all.
   *
   * "Any" rather than "all", and that is not the same shape as `archivedOnly`
   * below. Widening WITHIN one facet still narrows against no filter — the trap
   * there was a filter that merged two disjoint sets, live cards and archived
   * ones, into a single result. Requiring every label would also be useless at
   * this size: few cards carry two SPECIFIC labels, so a second pick would
   * almost always empty the list.
   */
  labelIds?: string[];
  priority?: Priority;
  /** `overdue` and `soon` need today's date to mean anything. */
  due?: 'any' | 'overdue' | 'today' | 'soon' | 'none';
  /**
   * Show ONLY archived cards. Absent or false means only live ones — the two
   * sets never mix.
   *
   * This used to be `includeArchived`, which ADDED the archive to whatever else
   * matched. That read correctly while it was a checkbox labelled "including
   * archived", and stopped reading correctly the moment it became a chip sitting
   * next to Overdue, Urgent and High: every other chip narrows the results, so
   * this one widening them was a trap you could only catch by counting rows —
   * which is exactly how it was caught (63 results, 67 with it on, the same live
   * cards still at the top).
   */
  archivedOnly?: boolean;
}

/** Normalise once per search rather than per card. */
function normalise(s: string): string {
  return s.toLowerCase().trim();
}

export function matchesText(card: SearchableCard, needle: string): boolean {
  const q = normalise(needle);
  if (q.length === 0) return true;
  return (
    normalise(card.title).includes(q) || normalise(card.description).includes(q)
  );
}

export function filterCards(
  cards: readonly SearchableCard[],
  filters: CardFilters,
  today: string,
): SearchableCard[] {
  const q = filters.text ? normalise(filters.text) : '';

  return cards.filter((c) => {
    // The archive is a separate place. You are either looking at live cards or
    // at archived ones, never both at once.
    if (filters.archivedOnly ? !c.archived : c.archived) return false;

    if (q && !matchesText(c, q)) return false;
    if (filters.assigneeUid && !c.assigneeUids.includes(filters.assigneeUid)) {
      return false;
    }
    if (
      filters.labelIds &&
      filters.labelIds.length > 0 &&
      !filters.labelIds.some((id) => c.labelIds.includes(id))
    ) {
      return false;
    }
    if (filters.priority && c.priority !== filters.priority) return false;

    switch (filters.due) {
      case 'overdue':
        if (!c.dueDate || c.dueDate >= today) return false;
        break;
      case 'today':
        if (c.dueDate !== today) return false;
        break;
      case 'soon':
        // Due within a week, and not already past.
        if (!c.dueDate || c.dueDate < today) return false;
        break;
      case 'none':
        if (c.dueDate) return false;
        break;
      default:
        break;
    }

    return true;
  });
}

/** True when any filter is actually narrowing the results. */
export function hasActiveFilters(filters: CardFilters): boolean {
  return Boolean(
    (filters.text && filters.text.trim()) ||
      filters.assigneeUid ||
      (filters.labelIds && filters.labelIds.length > 0) ||
      filters.priority ||
      (filters.due && filters.due !== 'any') ||
      filters.archivedOnly,
  );
}

/**
 * Rank matches so the most useful appear first: a title hit beats a description
 * hit, and an earlier position in the title beats a later one.
 */
export function rankMatches(
  cards: readonly SearchableCard[],
  needle: string,
): SearchableCard[] {
  const q = normalise(needle);
  if (!q) return [...cards];

  const score = (c: SearchableCard): number => {
    const title = normalise(c.title);
    const idx = title.indexOf(q);
    if (idx === 0) return 0; // title starts with the query
    if (idx > 0) return 1 + idx / 1000; // title contains it
    return 500; // description only
  };

  return [...cards].sort((a, b) => {
    const d = score(a) - score(b);
    return d !== 0 ? d : a.title.localeCompare(b.title);
  });
}
