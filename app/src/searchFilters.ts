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
import { useEffect, useState } from 'react';
import type { Priority } from '@sabeel/shared';

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

let current: SearchFilters = EMPTY_SEARCH_FILTERS;
const listeners = new Set<(f: SearchFilters) => void>();

function emit() {
  // A fresh object each time, so a subscriber's `useState` actually re-renders.
  const snapshot = { ...current };
  listeners.forEach((l) => l(snapshot));
}

/** Merge a change in. Callers only ever name the field they are changing. */
export function setSearchFilters(patch: Partial<SearchFilters>): void {
  current = { ...current, ...patch };
  emit();
}

export function clearSearchFilters(): void {
  current = EMPTY_SEARCH_FILTERS;
  emit();
}

export function useSearchFilters(): SearchFilters {
  const [f, setF] = useState<SearchFilters>(current);
  useEffect(() => {
    listeners.add(setF);
    // Re-read on mount: the value may have changed while this screen was gone,
    // which is the entire point of the module.
    setF(current);
    return () => {
      listeners.delete(setF);
    };
  }, []);
  return f;
}
