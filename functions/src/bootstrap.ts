import './setup';
import { onRequest } from 'firebase-functions/v2/https';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { isAllowedEmail } from '@sabeel/shared';

/**
 * TEMPORARY one-shot: create the very first admin. DELETE AFTER USE.
 *
 * There is a chicken-and-egg problem after the first deploy — only an admin can
 * promote anyone, and there is no admin yet. `scripts/grant-admin.mjs` solves it
 * with the Admin SDK, but that needs gcloud ADC or a service-account key, and
 * neither exists on this machine. The sibling time-tracker hit the same wall and
 * used exactly this: deploy, call once, delete.
 *
 * It is safe for the few minutes it exists, by construction rather than by
 * secrecy:
 *
 *  - It can ONLY ever promote the one hardcoded address below. Whoever calls it,
 *    the outcome is identical, so there is nothing to gain by racing to call it.
 *  - It refuses once ANY admin exists, so it cannot be replayed to re-grant
 *    access after someone is demoted.
 *  - It refuses if the address is not a verified @oursabeel.com account.
 *
 * That is why it takes no auth and needs no shared secret — a secret would have
 * to be transmitted, which is strictly worse than a function that can only do
 * one harmless thing.
 */
const FIRST_ADMIN_EMAIL = 'faisal@oursabeel.com';

export const bootstrapFirstAdmin = onRequest(
  { region: 'us-central1' },
  async (_req, res) => {
    const db = getFirestore();

    // One-shot: the moment a real admin exists, this is inert.
    const admins = await db.collection('users').where('role', '==', 'admin').get();
    const activeAdmin = admins.docs.find((d) => d.data().status === 'active');
    if (activeAdmin) {
      res.status(409).json({
        ok: false,
        reason: 'An admin already exists. This function is spent — delete it.',
      });
      return;
    }

    let user;
    try {
      user = await getAuth().getUserByEmail(FIRST_ADMIN_EMAIL);
    } catch {
      res.status(404).json({
        ok: false,
        reason: `No account for ${FIRST_ADMIN_EMAIL} yet. Sign in through the app once, then call this again.`,
      });
      return;
    }

    if (!isAllowedEmail(user.email, user.emailVerified)) {
      res.status(403).json({ ok: false, reason: 'Not a verified org account.' });
      return;
    }

    const claims = { role: 'admin', status: 'active' };
    // Claims first: the token is what firestore.rules trust. The doc is a
    // display mirror, so a failure after this leaves a working admin rather than
    // a doc claiming access the token does not grant.
    await getAuth().setCustomUserClaims(user.uid, claims);
    await db.doc(`users/${user.uid}`).set(
      { ...claims, claimsUpdatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );

    res.json({
      ok: true,
      uid: user.uid,
      email: user.email,
      note: 'Sign out and back in to pick up the claim. Now DELETE this function.',
    });
  },
);
