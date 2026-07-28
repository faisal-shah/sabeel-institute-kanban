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

/**
 * The popup was blocked and we are NOT redirecting behind the user's back.
 *
 * Its own class so the sign-in screen can offer the way out rather than print
 * an error — see `SignInScreen`.
 */
export class PopupBlockedError extends Error {
  readonly code = 'auth/popup-blocked';
  constructor() {
    super('The sign-in window was blocked.');
    this.name = 'PopupBlockedError';
  }
}

/** The explicit "try anyway" — a full-page redirect, only ever user-initiated. */
export async function signInWithGoogleRedirect(): Promise<void> {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ hd: ALLOWED_EMAIL_DOMAIN, prompt: 'select_account' });
  await signInWithRedirect(auth, provider);
}

export async function signInWithGoogle(): Promise<void> {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ hd: ALLOWED_EMAIL_DOMAIN, prompt: 'select_account' });

  try {
    await signInWithPopup(auth, provider);
  } catch (e) {
    const code = (e as { code?: string }).code;
    // A blocked popup does NOT silently become a redirect any more.
    //
    // It used to, on the reasoning that a link tapped in WhatsApp or Slack opens
    // a webview where popups are blocked, so a redirect was the only way in. In
    // practice the redirect is where those arrivals DIED: it goes to Google and
    // returns to `/__/auth/handler`, which needs the `sessionStorage` written
    // before the bounce — and an in-app webview that hands the user off to the
    // real browser does not have it. Firebase then renders "Unable to process
    // request due to missing initial state" on its own page, which is a DEAD
    // END: our app is not running there, so there is nothing to catch it, no
    // way back, and re-opening the link restores that same page. Reported by
    // three colleagues on 2026-07-28 and reproduced exactly by loading
    // `/__/auth/handler` with no state.
    //
    // So the choice is handed to the person instead. The screen explains that
    // the window was blocked, offers the link to open in a real browser, and
    // offers `signInWithRedirect` explicitly — which still works on a desktop
    // browser whose popup blocker is simply set to block, the case the fallback
    // was originally for.
    if (
      code === 'auth/popup-blocked' ||
      code === 'auth/operation-not-supported-in-this-environment'
    ) {
      throw new PopupBlockedError();
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
