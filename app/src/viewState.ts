/**
 * View state that has to outlive the screen holding it.
 *
 * `App.tsx` renders ONE screen per route, so opening a card unmounts the screen
 * you came from and every `useState` in it dies. For a draft or a busy flag that
 * is correct. For something the person deliberately set — a search, a filter, a
 * chosen tab — it is a bug: Back is supposed to return you to what you were
 * looking at, and instead it returns you to a blank one.
 *
 * Reported against Search, and found in the same shape on My Work (the
 * Assigned/Subscribed choice) and the boards list (its filter text). Rather than
 * three near-identical modules, this is the one mechanism, and it is the same
 * shape `nav.ts` already uses: a variable, a set of listeners, a hook.
 *
 * SESSION ONLY, deliberately. Nothing is persisted to storage — a filter set
 * last week is not one you meant to still be looking through today, and a reload
 * is the natural moment to forget. Each store also exposes a reset, because
 * state that survives navigation needs a visible way out or it becomes a trap.
 */
import { useEffect, useState } from 'react';

export interface ViewStore<T> {
  /** Current value, without subscribing — for non-React readers and for tests. */
  get: () => T;
  /**
   * Merge a change in. A patch may be a FUNCTION of the current value, and
   * anything deriving its new value from the old one must use that form: a
   * handler closes over the value from ITS render, so two taps landing before
   * React re-renders both compute from the same snapshot and one is lost.
   * The @mention popover keeps a ref beside its state for the same reason —
   * "key repeat is faster than a render", measured, not imagined.
   */
  set: (patch: Partial<T> | ((prev: T) => Partial<T>)) => void;
  /** Back to the initial value. */
  reset: () => void;
  /** Subscribe. Re-reads on mount, since the value may have moved while away. */
  use: () => T;
}

export function createViewStore<T extends object>(initial: T): ViewStore<T> {
  let current = initial;
  const listeners = new Set<(v: T) => void>();

  // A fresh object each time, or a subscriber's `useState` sees the same
  // reference and React has nothing to re-render on — the store would be right
  // while the screen stayed stale.
  const emit = () => {
    const snapshot = { ...current };
    listeners.forEach((l) => l(snapshot));
  };

  return {
    get: () => current,
    set: (patch) => {
      const next = typeof patch === 'function' ? patch(current) : patch;
      current = { ...current, ...next };
      emit();
    },
    reset: () => {
      current = initial;
      emit();
    },
    use: () => {
      const [v, setV] = useState<T>(current);
      useEffect(() => {
        listeners.add(setV);
        setV(current);
        return () => {
          listeners.delete(setV);
        };
      }, []);
      return v;
    },
  };
}
