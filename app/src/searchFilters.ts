/**
 * What Search is currently filtering by — held OUTSIDE React.
 *
 * `App.tsx` renders one screen per route, so pushing a card unmounts
 * `SearchScreen` and every `useState` in it dies. Coming back re-mounted an
 * empty screen: the text gone, the chips off, the label picks lost. Back is
 * supposed to return you to what you were looking at, and nothing about the
 * navigation stack was wrong — the state simply has to outlive the component.
 *
 * So it lives here, in a module, with the same shape `nav.ts` uses: one
 * variable, a set of listeners, and a hook that subscribes. No new concept, and
 * no provider to thread through the tree.
 *
 * SESSION ONLY. Nothing is persisted: a filter you set last week is not a filter
 * you meant to still be looking through today, and the app reloading is the
 * natural moment to forget. Within a session it survives everything — a card, a
 * different tab, a rotation — until the clear control on the screen is used.
 */
import type { Priority } from '@sabeel/shared';
import { createViewStore } from './viewState';

export interface SearchFilters {
  text: string;
  archivedOnly: boolean;
  overdueOnly: boolean;
  priority: Priority | undefined;
  /** Labels to match ANY of. */
  labelIds: string[];
  /** One board, or undefined for every board you can see. */
  boardId: string | undefined;
}

export const EMPTY_SEARCH_FILTERS: SearchFilters = {
  text: '',
  archivedOnly: false,
  overdueOnly: false,
  priority: undefined,
  labelIds: [],
  boardId: undefined,
};

const store = createViewStore<SearchFilters>(EMPTY_SEARCH_FILTERS);

/** The filters right now, without subscribing. */
export const getSearchFilters = store.get;

/**
 * Merge a change in. Pass a FUNCTION when the new value derives from the old —
 * see `createViewStore` for why a plain object loses a rapid second tap.
 */
export const setSearchFilters = store.set;

export const clearSearchFilters = store.reset;

export const useSearchFilters = store.use;

/**
 * Turn chosen label ids into chips, keeping ids that no longer resolve.
 *
 * Pure, and separate from the screen so it can be tested: the case it exists for
 * is hard to stage in a browser and easy to get wrong. `deleteLabel` can remove
 * a label while someone is filtering by it, and the previous code built chips by
 * filtering the org-wide set down to the chosen ids — so a dead id produced NO
 * chip while still narrowing the results. Search went empty with no cause on
 * screen and nothing to tap.
 *
 * The rule: every active filter is visible and removable, even a broken one.
 */
export function labelChips(
  labelIds: readonly string[],
  labels: readonly { id: string; name: string }[],
  sort: <T extends { name: string }>(ls: T[]) => T[],
): { id: string; name: string }[] {
  const byId = new Map(labels.map((l) => [l.id, l]));
  const known = sort(
    labelIds
      .map((id) => byId.get(id))
      .filter((l): l is { id: string; name: string } => l !== undefined)
      .map((l) => ({ id: l.id, name: l.name })),
  );
  const missing = labelIds.filter((id) => !byId.has(id));
  return [...known, ...missing.map((id) => ({ id, name: 'Deleted label' }))];
}
