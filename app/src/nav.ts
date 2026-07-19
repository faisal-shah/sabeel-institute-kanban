import { useCallback, useEffect, useState } from 'react';

/**
 * A tiny navigation stack.
 *
 * Deliberately not react-navigation: this app has a handful of screens, and the
 * routes below are a closed, typed union. A hand-rolled stack keeps the web and
 * Android surfaces behaving identically with no platform configuration, and it
 * is small enough to read in one sitting.
 *
 * If deep links or browser history become requirements, this is the one module
 * to replace.
 */
export type Route =
  | { name: 'boards' }
  | { name: 'board'; boardId: string }
  | { name: 'boardSettings'; boardId: string }
  | { name: 'newBoard' }
  | { name: 'card'; boardId: string; cardId: string }
  | { name: 'myWork' }
  | { name: 'search' }
  | { name: 'users' }
  | { name: 'notifications' };

let stack: Route[] = [{ name: 'boards' }];
const listeners = new Set<(s: Route[]) => void>();

function emit() {
  const snapshot = [...stack];
  listeners.forEach((l) => l(snapshot));
}

export function push(route: Route) {
  stack = [...stack, route];
  emit();
}

export function pop() {
  if (stack.length > 1) {
    stack = stack.slice(0, -1);
    emit();
  }
}

/** Replace the whole stack — used when signing out, or jumping to a root tab. */
export function reset(route: Route) {
  stack = [route];
  emit();
}

export function useNav() {
  const [s, setS] = useState<Route[]>(stack);
  useEffect(() => {
    listeners.add(setS);
    setS(stack);
    return () => {
      listeners.delete(setS);
    };
  }, []);

  return {
    route: s[s.length - 1],
    canGoBack: s.length > 1,
    push: useCallback(push, []),
    pop: useCallback(pop, []),
    reset: useCallback(reset, []),
  };
}
