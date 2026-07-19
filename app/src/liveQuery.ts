/**
 * The ONE way to subscribe to live Firestore data from a hook. Every live hook
 * in the app goes through here — never hand-roll onSnapshot state in a hook.
 * ESLint enforces this (see eslint.config.mjs).
 *
 * Invariants, inherited from a real bug in the sibling time-tracker project
 * (docs/INHERITED-STACK.md, lesson 5):
 *
 *  1. State RESETS to `loading` the moment the subscription inputs change. React
 *     state otherwise persists across dependency changes, so query A's results
 *     stay on screen while query B's first snapshot is in flight — on a slow
 *     connection that showed one week's entries under another week's heading.
 *     For a kanban board the equivalent is one board's cards appearing under
 *     another board's name, which is worse: people would act on them.
 *
 *  2. Listener errors also reset to empty and are surfaced. A server-rejected
 *     listen used to die as a console warning nobody sees on a phone. An empty
 *     screen plus a visible error beats silently-wrong data that never corrects.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  onSnapshot,
  type DocumentReference,
  type Query,
} from 'firebase/firestore';

export type LiveState<T> =
  | { status: 'loading'; data: undefined; error: undefined }
  | { status: 'ready'; data: T; error: undefined }
  | { status: 'error'; data: undefined; error: string };

const LOADING = { status: 'loading', data: undefined, error: undefined } as const;

// ---- Listener-error visibility -------------------------------------------
// Errors are broadcast so a screen-level banner can show them. A later success
// from the same source clears it.
const watchers = new Set<(msg: string | null) => void>();
let lastError: string | null = null;

function publishError(label: string, e: { code?: string; message: string }) {
  lastError = `Live data error (${label}): ${e.code ?? e.message}`;
  watchers.forEach((w) => w(lastError));
  console.warn(`${label} listener`, e.code ?? e.message);
}

function publishSuccess(label: string) {
  if (lastError?.includes(`(${label})`)) {
    lastError = null;
    watchers.forEach((w) => w(null));
  }
}

/** Subscribe to the most recent live-data error, for a screen-level banner. */
export function useListenerError(): string | null {
  const [msg, setMsg] = useState(lastError);
  useEffect(() => {
    watchers.add(setMsg);
    return () => {
      watchers.delete(setMsg);
    };
  }, []);
  return msg;
}

/**
 * Subscribe to a query. `deps` identify the subscription: when they change the
 * state resets, so stale results can never be shown under new inputs.
 *
 * Pass `null` for the query to subscribe to nothing (e.g. while signed out)
 * without violating the rules of hooks.
 */
export function useLiveQuery<T>(
  label: string,
  build: () => Query | null,
  map: (docs: { id: string; data: Record<string, unknown> }[]) => T,
  deps: readonly unknown[],
): LiveState<T> {
  const [state, setState] = useState<LiveState<T>>(LOADING);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const query = useMemo(build, deps);

  useEffect(() => {
    // Invariant 1: reset before the new subscription produces anything.
    setState(LOADING);
    if (!query) return;

    const unsub = onSnapshot(
      query,
      (snap) => {
        publishSuccess(label);
        setState({
          status: 'ready',
          data: map(
            snap.docs.map((d) => ({ id: d.id, data: d.data() as Record<string, unknown> })),
          ),
          error: undefined,
        });
      },
      (e) => {
        publishError(label, e);
        // Invariant 2: never leave stale rows visible behind an error.
        setState({ status: 'error', data: undefined, error: e.code ?? e.message });
      },
    );
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  return state;
}

/** Subscribe to a single document. Same invariants as useLiveQuery. */
export function useLiveDoc<T>(
  label: string,
  build: () => DocumentReference | null,
  map: (doc: { id: string; data: Record<string, unknown> } | null) => T,
  deps: readonly unknown[],
): LiveState<T> {
  const [state, setState] = useState<LiveState<T>>(LOADING);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const ref = useMemo(build, deps);

  useEffect(() => {
    setState(LOADING);
    if (!ref) return;

    const unsub = onSnapshot(
      ref,
      (snap) => {
        publishSuccess(label);
        setState({
          status: 'ready',
          data: map(
            snap.exists()
              ? { id: snap.id, data: snap.data() as Record<string, unknown> }
              : null,
          ),
          error: undefined,
        });
      },
      (e) => {
        publishError(label, e);
        setState({ status: 'error', data: undefined, error: e.code ?? e.message });
      },
    );
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref]);

  return state;
}
