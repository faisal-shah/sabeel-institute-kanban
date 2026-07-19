import './setup';
import { onCall, HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { guarded, sentryDsn } from './sentry';
import { logger } from 'firebase-functions/v2';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import {
  ACCESS_CHANGE_MESSAGES,
  checkAccessChange,
  isRole,
  isUserStatus,
} from '@sabeel/shared';
import type { Role, UserStatus } from '@sabeel/shared';

/**
 * The ONLY way role or status ever changes. Clients cannot write these fields —
 * firestore.rules denies all writes to users/* — so this callable is the single
 * chokepoint, and every access decision in the app traces back to it.
 *
 * Claims are the authority; the user doc is a mirror kept for display and for
 * admin screens that need to list people the caller has never met.
 */
export const setUserAccess = onCall({ secrets: [sentryDsn] }, guarded(async (request: CallableRequest<{ uid?: unknown; role?: unknown; status?: unknown }>) => {
  const auth = request.auth;
  if (!auth) {
    throw new HttpsError('unauthenticated', 'Sign in first.');
  }

  const actor = {
    uid: auth.uid,
    // Read from the TOKEN, never from the user doc — the doc is a mirror and a
    // stale or tampered mirror must not be able to grant anything.
    role: (auth.token.role ?? 'member') as Role,
    status: (auth.token.status ?? 'pending') as UserStatus,
  };

  const targetUid = request.data?.uid;
  const nextRole = request.data?.role;
  const nextStatus = request.data?.status;

  if (typeof targetUid !== 'string' || targetUid.length === 0) {
    throw new HttpsError('invalid-argument', 'A target uid is required.');
  }

  const verdict = checkAccessChange({ actor, targetUid, nextRole, nextStatus });
  if (!verdict.ok) {
    logger.warn('Rejected setUserAccess', {
      actorUid: actor.uid,
      actorRole: actor.role,
      targetUid,
      reason: verdict.reason,
    });
    // permission-denied for authorisation failures, invalid-argument for
    // malformed input — the client shows the message either way, but the
    // distinction matters when reading logs after an incident.
    const code =
      verdict.reason === 'invalid-role' || verdict.reason === 'invalid-status'
        ? 'invalid-argument'
        : 'permission-denied';
    throw new HttpsError(code, ACCESS_CHANGE_MESSAGES[verdict.reason]);
  }

  // Narrowed by checkAccessChange, but re-narrowed here so TypeScript agrees and
  // so this function is safe if the checks are ever reordered.
  if (!isRole(nextRole) || !isUserStatus(nextStatus)) {
    throw new HttpsError('invalid-argument', 'Unknown role or status.');
  }

  const db = getFirestore();
  const userRef = db.doc(`users/${targetUid}`);
  const snap = await userRef.get();
  if (!snap.exists) {
    throw new HttpsError('not-found', 'No such user.');
  }

  await getAuth().setCustomUserClaims(targetUid, {
    role: nextRole,
    status: nextStatus,
  });

  // `claimsUpdatedAt` is what the client watches to know it must force-refresh
  // its ID token. Without it an approved user would sit on a stale `pending`
  // token until it expired (up to an hour) or they signed out and in —
  // which reads as "the admin approved me and nothing happened".
  await userRef.update({
    role: nextRole,
    status: nextStatus,
    claimsUpdatedAt: FieldValue.serverTimestamp(),
    accessChangedBy: actor.uid,
  });

  // Revoking refresh tokens on the way OUT is what makes disabling immediate:
  // otherwise a disabled user keeps a valid token until it expires.
  if (nextStatus === 'disabled' || nextStatus === 'rejected') {
    await getAuth().revokeRefreshTokens(targetUid);
  }

  logger.info('Access changed', {
    actorUid: actor.uid,
    targetUid,
    role: nextRole,
    status: nextStatus,
  });

  return { ok: true, uid: targetUid, role: nextRole, status: nextStatus };
}));
