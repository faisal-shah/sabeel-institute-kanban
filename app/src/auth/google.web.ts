import {
  getRedirectResult,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
} from 'firebase/auth';
import { ALLOWED_EMAIL_DOMAIN } from '@sabeel/shared';
import { auth } from '../firebase';
import { captureError } from '../sentry';

/**
 * Google sign-in on the web. Works against the Auth emulator too — the popup
 * shows the emulator's fake account chooser instead of real Google.
 *
 * `hd` restricts the account chooser to the Workspace domain. It is a UX
 * convenience ONLY — trivially bypassed, never treated as a check. The real
 * enforcement is the auth-create Cloud Function, which is the ONLY domain check
 * now that the consent screen is External (see TODO.md § C).
 */

/**
 * A failed `signInWithRedirect` surfaces ONLY here, on the page load after the
 * bounce back. Without this call the user silently lands back on the sign-in
 * screen with no explanation and nothing reaches Sentry. Success needs no
 * handling — the auth listener picks it up.
 */
getRedirectResult(auth).catch((e) => captureError(e, { source: 'redirectSignIn' }));

export async function signInWithGoogle(): Promise<void> {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ hd: ALLOWED_EMAIL_DOMAIN, prompt: 'select_account' });

  try {
    await signInWithPopup(auth, provider);
  } catch (e) {
    const code = (e as { code?: string }).code;
    // Popups are routinely blocked inside the in-app browsers people actually
    // arrive from — a link tapped in WhatsApp or Slack opens a webview, not the
    // system browser. Falling back to a full-page redirect is what makes those
    // arrivals work at all, and a shared link is the common way into this app.
    if (
      code === 'auth/popup-blocked' ||
      code === 'auth/operation-not-supported-in-this-environment'
    ) {
      await signInWithRedirect(auth, provider);
      return;
    }

    // Changing your mind is not a failure. Closing the Google popup, or opening
    // a second one which supersedes the first, raises these — and because the
    // sign-in screen reports what it catches, they were arriving in Sentry as
    // if something had broken. An issue stream full of people deciding not to
    // sign in is one nobody reads, which costs us the real reports.
    //
    // The native seam has always treated cancellation this way
    // (SIGN_IN_CANCELLED / IN_PROGRESS); web simply never matched it.
    if (
      code === 'auth/popup-closed-by-user' ||
      code === 'auth/cancelled-popup-request' ||
      code === 'auth/user-cancelled'
    ) {
      return;
    }

    throw e;
  }
}

/** Web keeps no Google session of its own — Firebase sign-out is enough. */
export async function googleSignOut(): Promise<void> {}

export const googleSignInAvailable = true;
