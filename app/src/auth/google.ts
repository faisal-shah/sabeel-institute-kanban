import type { UserCredential } from 'firebase/auth';

/**
 * Google sign-in on Android.
 *
 * Native Google Sign-In needs a registered Android OAuth client: a real
 * `google-services.json` with a `client_type: 1` entry, the debug/release SHA-1
 * registered, and the WEB client id passed as `webClientId`. None of that exists
 * until TODO.md § D is done, so this throws a clear message rather than failing
 * deep inside the native module with an unreadable DEVELOPER_ERROR.
 *
 * Until then, native development uses the emulator dev sign-in (devSignIn.ts).
 * Wiring this up is the first task of the phase that needs real sign-in on a
 * device; the seam and its call sites are already in place.
 */
export async function signInWithGoogle(): Promise<UserCredential> {
  throw new Error(
    'Native Google Sign-In is not wired yet — the Firebase Android app is not ' +
      'registered (see TODO.md § D). Use the emulator dev sign-in for now.',
  );
}

export const googleSignInAvailable = false;
