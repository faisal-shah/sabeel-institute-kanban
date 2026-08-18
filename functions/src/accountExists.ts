import { onCall, HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { getAuth } from 'firebase-admin/auth';
import { OAuth2Client } from 'google-auth-library';
import { GOOGLE_WEB_CLIENT_ID } from '@sabeel/shared';
import { isEmulatorProject } from './env';
import { guarded, sentryDsn } from './sentry';

/**
 * Does an account already exist for the holder of this Google token?
 *
 * THE MOBILE APPS MUST NEVER CREATE AN ACCOUNT. That is not a preference: both
 * stores require in-app account deletion only if the app *supports account
 * creation*, and satisfying neither trigger is what lets these apps ship without
 * a deletion flow that would have to argue for retaining organisation-owned
 * records. `docs/STORE-RELEASE.md` is the full statement.
 *
 * `signInWithCredential` is the line that creates an account, so the native
 * sign-in path asks this first and never reaches that line for an identity with
 * no account. Account creation happens on the web app only, where the same
 * self-service Google sign-in works exactly as it always has.
 *
 * UNAUTHENTICATED, necessarily — there is no session yet; establishing one is
 * the thing being gated. That is safe here because the caller has already proved
 * they control the address, by presenting a Google-signed token for it. This is
 * not an oracle somebody can point at an arbitrary email.
 *
 * It also cannot be done on the client. `fetchSignInMethodsForEmail` returns an
 * empty array for every project created after 15 September 2023 — email
 * enumeration protection is on by default and the method is deprecated on all
 * platforms. An Admin SDK callable is Firebase's documented replacement.
 */

/**
 * Verifies GOOGLE's ID token, not Firebase's.
 *
 * `getAuth().verifyIdToken()` is the wrong tool and fails confusingly here: it
 * verifies tokens *Firebase* issued (`iss: securetoken.google.com/<project>`),
 * and what arrives at this callable is issued by `accounts.google.com` for the
 * OAuth client, because the user has not signed in to Firebase yet — that is the
 * entire point.
 */
const oauth = new OAuth2Client();

/**
 * The address this token belongs to, or `null` if it proves nothing.
 *
 * The emulator branch exists because there is no way to mint a Google-signed
 * token in a test, and it mirrors what `devSignIn.ts` already does on the client
 * — the Auth emulator itself accepts a plain JSON payload where a real ID token
 * would go, so tests and dev sign-in speak the same dialect.
 *
 * Keyed off `isEmulatorProject()`, whose docblock carries the safety argument:
 * it cannot come back true against a real project. Do not swap it for an env
 * flag, which a shell can carry into a deploy.
 */
async function verifiedEmail(idToken: string): Promise<string | null> {
  if (isEmulatorProject()) {
    // THROWS on unreadable input rather than returning null, so the emulator
    // branch rejects a garbage token exactly as production does. Swallowing it
    // into `exists: false` would make the two halves of this seam disagree, and
    // the tests would then be asserting behaviour that only exists in tests.
    const payload = JSON.parse(idToken) as { email?: string; email_verified?: boolean };
    return payload.email_verified === true && payload.email ? payload.email : null;
  }

  // Pinning the audience is what stops a token minted for a DIFFERENT OAuth
  // client being replayed here. Without it any valid Google token would pass.
  const ticket = await oauth.verifyIdToken({ idToken, audience: GOOGLE_WEB_CLIENT_ID });
  const payload = ticket.getPayload();
  // An unverified address proves nothing about who is holding it, so it can
  // never be matched against an account.
  return payload?.email_verified === true && payload.email ? payload.email : null;
}

export const accountExists = onCall(
  { secrets: [sentryDsn] },
  guarded(async (request: CallableRequest<{ idToken?: unknown }>) => {
    const idToken = request.data?.idToken;
    if (typeof idToken !== 'string' || idToken === '') {
      throw new HttpsError('invalid-argument', 'A Google ID token is required.');
    }

    let email: string | null;
    try {
      email = await verifiedEmail(idToken);
    } catch {
      // Deliberately opaque, and deliberately not reported: a bad token is an
      // ordinary thing for a public endpoint to receive, not an incident.
      throw new HttpsError('unauthenticated', 'That sign-in could not be verified.');
    }
    if (!email) return { exists: false };

    try {
      await getAuth().getUserByEmail(email);
      return { exists: true };
    } catch (e) {
      if ((e as { code?: string }).code === 'auth/user-not-found') {
        return { exists: false };
      }
      // Anything else is a real failure. Returning `false` here would tell a
      // legitimate colleague their account is gone because Auth had a bad
      // minute, so it must surface rather than be swallowed.
      throw e;
    }
  }),
);
