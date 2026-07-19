import {
  GoogleSignin,
  statusCodes,
  isSuccessResponse,
} from '@react-native-google-signin/google-signin';
import { GoogleAuthProvider, signInWithCredential } from 'firebase/auth';
import { WEB_CLIENT_ID } from '../firebase-config';
import { auth } from '../firebase';

/**
 * Google sign-in on Android (web sibling: google.web.ts).
 *
 * Uses the native Google Sign-In SDK to obtain an ID token, then exchanges it
 * for a Firebase credential — the same `signInWithCredential` path the emulator
 * dev sign-in exercises, so everything downstream of the session is identical.
 *
 * Requires BOTH of these, or Google returns an opaque `DEVELOPER_ERROR`:
 *  - the debug/release SHA-1 registered on the Firebase Android app, with
 *    `google-services.json` **re-downloaded afterwards** — the re-download is
 *    what adds the `client_type: 1` entry;
 *  - `webClientId` set to the WEB client id, not the Android one.
 */
let configured = false;
function ensureConfigured() {
  if (configured) return;
  // MUST be the *Web* OAuth client id (client_type: 3). Passing the Android id
  // is a classic source of DEVELOPER_ERROR.
  GoogleSignin.configure({ webClientId: WEB_CLIENT_ID });
  configured = true;
}

/**
 * Clear the remembered Google account.
 *
 * Without this the next `signIn()` silently reuses the previous account and
 * there is no way to switch users — signing out of the app must also sign out
 * of Google so the account chooser reappears. On a shared or handed-over phone
 * that is the difference between signing out and only appearing to.
 */
export async function googleSignOut(): Promise<void> {
  ensureConfigured();
  await GoogleSignin.signOut();
}

export async function signInWithGoogle(): Promise<void> {
  ensureConfigured();
  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const response = await GoogleSignin.signIn();
    if (!isSuccessResponse(response)) {
      // The account chooser was dismissed. Not an error worth surfacing.
      return;
    }
    const idToken = response.data.idToken;
    if (!idToken) throw new Error('Google sign-in returned no ID token.');
    await signInWithCredential(auth, GoogleAuthProvider.credential(idToken));
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === statusCodes.SIGN_IN_CANCELLED || code === statusCodes.IN_PROGRESS) {
      return; // cancelled, or a sign-in is already running
    }
    if (code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
      throw new Error('Google Play services are required to sign in.');
    }
    throw e;
  }
}

export const googleSignInAvailable = true;
