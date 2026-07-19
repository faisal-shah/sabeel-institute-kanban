import {
  GoogleAuthProvider,
  signInWithCredential,
  type UserCredential,
} from 'firebase/auth';
import { ALLOWED_EMAIL_DOMAIN } from '@sabeel/shared';
import { auth } from '../firebase';
import { IS_DEV, USE_EMULATORS } from '../env';

/**
 * Emulator-only sign-in, so the app can be developed and screenshotted before
 * the real Firebase project and OAuth clients exist.
 *
 * MUST NEVER APPEAR IN A PRODUCTION BUILD. Two independent conditions gate it —
 * `__DEV__` and the explicit emulator flag — because either alone could be got
 * wrong: a release build carrying a stale emulator env, or a dev build pointed
 * at production. Before publishing a release APK, screenshot the sign-in screen
 * and confirm this row is absent.
 */
export const devSignInAvailable = IS_DEV && USE_EMULATORS;

/**
 * Signs in through the GOOGLE provider, not email/password.
 *
 * The Auth emulator accepts a JSON payload where a real Google ID token would
 * go, which lets us mint a Google-provider identity with `email_verified: true`.
 * That fidelity matters: email/password sign-up produces an UNVERIFIED address,
 * and the auth-create trigger correctly deletes unverified accounts — so a
 * password-based dev path would have every dev user vanish a second after
 * signing in, and would never exercise the real provider flow.
 *
 * Sign in with a non-org address here and the trigger will delete the account,
 * exactly as in production. That is the intended behaviour, and a useful way to
 * see the domain check work.
 */
export async function devSignIn(localPart: string): Promise<UserCredential> {
  if (!devSignInAvailable) {
    throw new Error('Dev sign-in is not available in this build.');
  }

  const email = localPart.includes('@')
    ? localPart
    : `${localPart}@${ALLOWED_EMAIL_DOMAIN}`;

  const displayName = email
    .split('@')[0]
    .split(/[._-]/)
    .filter(Boolean)
    .map((p) => p[0].toUpperCase() + p.slice(1))
    .join(' ');

  // Stable subject per address, so signing in twice returns the same account
  // rather than piling up duplicates in the approval queue.
  const credential = GoogleAuthProvider.credential(
    JSON.stringify({
      sub: `dev-${email}`,
      email,
      email_verified: true,
      name: displayName,
    }),
  );

  return signInWithCredential(auth, credential);
}

/** Handy fixtures for the dev sign-in row. */
export const DEV_ACCOUNTS = ['faisal', 'sara', 'omar', 'intruder@gmail.com'] as const;
