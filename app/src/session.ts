/**
 * The signed-in session: who you are, and what you may do.
 *
 * The subtle part is claim freshness. Custom claims live in the ID token, and a
 * token is only refreshed when it expires (up to an hour) or on an explicit
 * force-refresh. So when an admin approves someone, that person keeps a token
 * saying `pending` and stays locked out — which reads as "the admin approved me
 * and nothing happened".
 *
 * The fix: setUserAccess stamps `claimsUpdatedAt` on the user doc, this module
 * watches its own doc, and force-refreshes the token whenever that stamp moves.
 * Approval un-gates the app within a second, with no sign-out.
 *
 * This file is exempt from the useLiveQuery lint rule (see eslint.config.mjs):
 * it owns the auth lifecycle and does its own reset, and useLiveQuery is a hook
 * that cannot be used from a module-level auth listener.
 */
import { useEffect, useState } from 'react';
import { onAuthStateChanged, signOut as fbSignOut, type User } from 'firebase/auth';
import { doc, onSnapshot, type DocumentSnapshot } from 'firebase/firestore';
import { canAdministerUsers, canManageBoards, canUseApp } from '@sabeel/shared';
import type { Role, UserStatus } from '@sabeel/shared';
import { auth, db } from './firebase';
import { IS_DEV } from './env';

export interface SessionUser {
  uid: string;
  email: string;
  displayName: string;
  photoUrl: string | null;
  role: Role;
  status: UserStatus;
}

export type Session =
  | { state: 'loading' }
  | { state: 'signed-out' }
  /** Signed in, but the user doc/claims have not arrived yet. */
  | { state: 'provisioning'; uid: string }
  | { state: 'signed-in'; user: SessionUser };

type Listener = (s: Session) => void;

let current: Session = { state: 'loading' };
const listeners = new Set<Listener>();

function emit(next: Session) {
  current = next;
  listeners.forEach((l) => l(next));
}

let unsubUserDoc: (() => void) | null = null;
let lastClaimsStamp: number | null = null;

function stopWatchingUserDoc() {
  unsubUserDoc?.();
  unsubUserDoc = null;
  lastClaimsStamp = null;
}

/**
 * Read role/status from the TOKEN, not the user doc. The doc is a mirror for
 * display; rules trust the token, so the UI must agree with the token or people
 * will see buttons that always fail.
 */
/** Reject rather than hang forever — see readClaims. */
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) =>
      setTimeout(() => rej(new Error(`${label} timed out after ${ms}ms`)), ms),
    ),
  ]);
}

async function readClaims(
  fbUser: User,
  forceRefresh: boolean,
): Promise<{ role: Role; status: UserStatus }> {
  let token;
  try {
    // A forced refresh is a network round trip, and a network call with no
    // timeout is a hang waiting to happen. Neither a failure NOR a hang may
    // strand the user on the "Setting up your account…" spinner, so bound it and
    // fall back to the cached token — they keep their previous access level
    // until the next snapshot retries, which is far better than an app that
    // never renders.
    token = await withTimeout(
      fbUser.getIdTokenResult(forceRefresh),
      forceRefresh ? 8000 : 4000,
      'token refresh',
    );
  } catch (e) {
    console.warn('token refresh failed, falling back to cached claims', e);
    try {
      token = await withTimeout(fbUser.getIdTokenResult(false), 4000, 'cached token');
    } catch {
      return { role: 'member', status: 'pending' };
    }
  }
  return {
    role: (token.claims.role as Role) ?? 'member',
    status: (token.claims.status as UserStatus) ?? 'pending',
  };
}

async function handleUserSnapshot(fbUser: User, snap: DocumentSnapshot): Promise<void> {
  // Dev-only breadcrumb. When the gate misbehaves the first question is always
  // "did the snapshot arrive, and from cache or the server?" — those two
  // booleans separate "never arrived", "stale cache" and "the server really says
  // no". They are what identified the emulator project-id mismatch on
  // 2026-07-19 (docs/INHERITED-STACK.md lesson 8) after two runs of guessing.
  if (IS_DEV) {
    console.warn(
      `[session] snapshot exists=${snap.exists()} fromCache=${snap.metadata.fromCache} uid=${fbUser.uid}`,
    );
  }
  if (!snap.exists()) {
    // The auth-create trigger has not finished yet, or it rejected the account
    // and is about to delete it. Neither is an error state.
    emit({ state: 'provisioning', uid: fbUser.uid });
    return;
  }

  const data = snap.data() ?? {};
  const stamp: number | null =
    typeof data.claimsUpdatedAt?.toMillis === 'function'
      ? data.claimsUpdatedAt.toMillis()
      : null;

  // Force a token refresh when the server says the claims moved. The FIRST
  // sighting always refreshes too: the trigger sets claims after sign-in, so the
  // token in hand predates them and would still say "no claims at all".
  const claimsChanged = lastClaimsStamp === null || stamp !== lastClaimsStamp;
  lastClaimsStamp = stamp;

  const claims = await readClaims(fbUser, claimsChanged);

  emit({
    state: 'signed-in',
    user: {
      uid: fbUser.uid,
      email: (data.email as string) ?? fbUser.email ?? '',
      displayName: (data.displayName as string) ?? fbUser.displayName ?? '',
      photoUrl: (data.photoUrl as string | null) ?? null,
      role: claims.role,
      status: claims.status,
    },
  });
}

function watchUserDoc(fbUser: User) {
  stopWatchingUserDoc();

  unsubUserDoc = onSnapshot(
    doc(db, 'users', fbUser.uid),
    (snap) => {
      // Deliberately NOT an async function passed straight to onSnapshot: an
      // unhandled rejection there would silently strand the app in
      // `provisioning` with no error surfaced anywhere.
      void handleUserSnapshot(fbUser, snap).catch((e) => {
        console.warn('user snapshot handler failed', e);
        emit({ state: 'provisioning', uid: fbUser.uid });
      });
    },
    (e) => {
      // A signed-in user can always read their own doc, so this is unexpected.
      console.warn('user doc listener', e.code ?? e.message);
      emit({ state: 'provisioning', uid: fbUser.uid });
    },
  );
}

onAuthStateChanged(auth, (fbUser) => {
  if (!fbUser) {
    stopWatchingUserDoc();
    emit({ state: 'signed-out' });
    return;
  }
  emit({ state: 'provisioning', uid: fbUser.uid });
  watchUserDoc(fbUser);
});

export function useSession(): Session {
  const [s, setS] = useState<Session>(current);
  useEffect(() => {
    listeners.add(setS);
    setS(current);
    return () => {
      listeners.delete(setS);
    };
  }, []);
  return s;
}

export async function signOut(): Promise<void> {
  stopWatchingUserDoc();
  await fbSignOut(auth);
}

/** Capability helpers, delegating to the shared logic the server enforces. */
export const sessionCan = {
  useApp: (u: SessionUser) => canUseApp(u),
  manageBoards: (u: SessionUser) => canManageBoards(u),
  administerUsers: (u: SessionUser) => canAdministerUsers(u),
};
