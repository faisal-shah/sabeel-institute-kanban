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
import { captureError } from './sentry';

/**
 * A document as handed to a mapper. `path` matters for collection-group queries,
 * where the parent ids live only in the path — My Work reads the board id from
 * `boards/{boardId}/cards/{cardId}` rather than duplicating it into a field.
 */
export interface LiveDoc {
  id: string;
  data: Record<string, unknown>;
  path: string;
}

export type LiveState<T> =
  | { status: 'loading'; data: undefined; error: undefined }
  | { status: 'ready'; data: T; error: undefined }
  | { status: 'error'; data: undefined; error: string };

const LOADING = { status: 'loading', data: undefined, error: undefined } as const;

// ---- Last-result cache ----------------------------------------------------
/**
 * The last mapped result for each subscription, so returning to a screen you
 * were just on renders immediately instead of tearing down to a spinner.
 *
 * Navigating opened a FULL-SCREEN "Loading card…" for about a second, then the
 * content appeared — in both directions. That reads as the screen failing to
 * draw rather than as loading, because everything vanishes including the parts
 * that never changed.
 *
 * This does NOT weaken invariant 1. The bug that invariant exists for is showing
 * query A's data under query B's inputs; the key here is the label plus the deps
 * that IDENTIFY the subscription, so a different query has no entry and still
 * starts at `loading`. Only a query showing its own previous result skips the
 * spinner — and Firestore is about to re-deliver exactly that from its cache.
 *
 * Errors evict, so invariant 2 holds too: a failed listen never leaves stale
 * rows on screen.
 */
const lastResults = new Map<string, unknown>();
const MAX_CACHED = 60;

function cacheKey(label: string, deps: readonly unknown[]): string {
  return `${label}|${JSON.stringify(deps)}`;
}

function remember(key: string, value: unknown) {
  // Bounded: keys include ids (every card visited), so this would otherwise grow
  // for the life of the session. Oldest-out is fine — the cost of a miss is the
  // spinner we had before.
  if (lastResults.size >= MAX_CACHED) {
    const oldest = lastResults.keys().next().value;
    if (oldest !== undefined) lastResults.delete(oldest);
  }
  lastResults.delete(key);
  lastResults.set(key, value);
}

function cachedState<T>(key: string): LiveState<T> {
  const hit = lastResults.get(key);
  return hit === undefined
    ? (LOADING as LiveState<T>)
    : { status: 'ready', data: hit as T, error: undefined };
}

/**
 * Drop every cached result. Called on sign-out: the cache is keyed by query
 * shape (e.g. boardId), not by user, so on a SHARED device the next person to
 * sign in could otherwise see a one-frame flash of the previous user's board
 * before their own listeners deliver.
 */
export function clearLiveResultCache(): void {
  lastResults.clear();
  // The error banner is module-level too, and it outlived the session that
  // caused it: sign out while "Live data error (boards): permission-denied" is
  // showing and the next person to sign in on that device inherits it, quoting a
  // refusal that was never theirs. It only cleared when a query with the SAME
  // label next succeeded. Cache and banner are one session's state; they get
  // cleared together.
  lastError = null;
  watchers.forEach((w) => w(null));
}

// ---- Listener-error visibility -------------------------------------------
// Errors are broadcast so a screen-level banner can show them. A later success
// from the same source clears it.
const watchers = new Set<(msg: string | null) => void>();
let lastError: string | null = null;

function publishError(label: string, e: { code?: string; message: string }) {
  lastError = `Live data error (${label}): ${e.code ?? e.message}`;
  watchers.forEach((w) => w(lastError));
  console.warn(`${label} listener`, e.code ?? e.message);
  // Off-device visibility. A rejected listen on someone's phone is invisible
  // otherwise — the sibling project lost a day to exactly that (see
  // docs/INHERITED-STACK.md lesson 5). With a DSN wired it is one dashboard
  // event; without one it is at least a console warning.
  captureError(e, { source: label });
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
  map: (docs: LiveDoc[]) => T,
  deps: readonly unknown[],
): LiveState<T> {
  const key = cacheKey(label, deps);
  const [state, setState] = useState<LiveState<T>>(() => cachedState<T>(key));

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const query = useMemo(build, deps);

  useEffect(() => {
    // Invariant 1: never show ANOTHER query's data. A cache hit here is this
    // same subscription's own last result, which is not that.
    setState(cachedState<T>(key));
    if (!query) return;

    const unsub = onSnapshot(
      query,
      (snap) => {
        publishSuccess(label);
        const data = map(
          snap.docs.map((d) => ({
            id: d.id,
            data: d.data() as Record<string, unknown>,
            path: d.ref.path,
          })),
        );
        remember(key, data);
        setState({ status: 'ready', data, error: undefined });
      },
      (e) => {
        publishError(label, e);
        // Invariant 2: never leave stale rows visible behind an error — including
        // via the cache, so a later remount cannot resurrect them either.
        lastResults.delete(key);
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
  map: (doc: LiveDoc | null) => T,
  deps: readonly unknown[],
): LiveState<T> {
  const key = cacheKey(label, deps);
  const [state, setState] = useState<LiveState<T>>(() => cachedState<T>(key));

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const ref = useMemo(build, deps);

  useEffect(() => {
    setState(cachedState<T>(key));
    if (!ref) return;

    const unsub = onSnapshot(
      ref,
      (snap) => {
        publishSuccess(label);
        const data = map(
          snap.exists()
            ? {
                id: snap.id,
                data: snap.data() as Record<string, unknown>,
                path: snap.ref.path,
              }
            : null,
        );
        remember(key, data);
        setState({ status: 'ready', data, error: undefined });
      },
      (e) => {
        publishError(label, e);
        lastResults.delete(key);
        setState({ status: 'error', data: undefined, error: e.code ?? e.message });
      },
    );
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref]);

  return state;
}
