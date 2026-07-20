import './setup';
import * as functionsV1 from 'firebase-functions/v1';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { decideProvision } from './provision';

/**
 * Server-side account provisioning and domain enforcement.
 *
 * Runs on every new Firebase Auth user. Two outcomes:
 *
 *  - Not a verified @oursabeel.com address → the auth user is deleted outright.
 *    Nothing is written to Firestore, so a stray account leaves no trace and the
 *    person can retry with the right address. Deleting rather than merely
 *    marking rejected keeps the users collection meaningful: everything in it is
 *    someone who legitimately reached the approval queue.
 *
 *  - Valid address → claims are set to pending/member and a mirrored user doc is
 *    created. Pending grants nothing; an admin must approve. The doc exists so
 *    admins can see who is waiting, with a name and address to judge by.
 *
 * Gen-1 auth trigger: `beforeUserCreated` (a blocking function) would reject
 * before the auth user is ever created, but it requires upgrading the project to
 * Identity Platform.
 *
 * That trade-off was originally justified by the consent screen being Internal,
 * so Google rejected outsiders first. It is NOT any more (2026-07-19: External,
 * because Internal needs a Cloud organization). The upgrade is now a genuine
 * improvement rather than a redundant one, and is worth doing if stray sign-ups
 * become a nuisance.
 *
 * It is not urgent, because the window it closes is not exploitable: between the
 * auth user being created and this trigger deleting it, that account has no
 * custom claims, and every rule in firestore.rules gates on
 * `status == 'active'` with a default of '' — so a claimless token can read
 * nothing.
 */
export const onUserCreate = functionsV1
  .region('us-central1')
  .auth.user()
  .onCreate(async (user) => {
    const decision = decideProvision({
      email: user.email,
      emailVerified: user.emailVerified,
      displayName: user.displayName,
      photoURL: user.photoURL,
    });

    if (decision.action === 'reject') {
      functionsV1.logger.warn('Rejected sign-up outside the org domain', {
        uid: user.uid,
        email: decision.email,
        reason: decision.reason,
      });
      await getAuth().deleteUser(user.uid);
      return;
    }

    const { claims, profile } = decision;

    // Claims first: the token is what firestore.rules trusts. If the doc write
    // failed afterwards we would have a user who can do nothing (pending grants
    // nothing) rather than a user with a doc but no claims, which the client
    // would misread as approved-but-broken.
    await getAuth().setCustomUserClaims(user.uid, claims);

    await getFirestore()
      .doc(`users/${user.uid}`)
      .set({
        displayName: profile.displayName,
        email: profile.email,
        photoUrl: profile.photoUrl,
        status: claims.status,
        role: claims.role,
        notifyPrefs: {},
        mutedBoardIds: [],
        favoriteBoardIds: [],
        recentBoardIds: [],
        unreadNotifCount: 0,
        createdAt: FieldValue.serverTimestamp(),
        claimsUpdatedAt: FieldValue.serverTimestamp(),
      });

    functionsV1.logger.info('Provisioned pending account', {
      uid: user.uid,
      email: profile.email,
    });
  });
