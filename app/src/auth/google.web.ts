import {
  GoogleAuthProvider,
  signInWithPopup,
  type UserCredential,
} from 'firebase/auth';
import { ALLOWED_EMAIL_DOMAIN } from '@sabeel/shared';
import { auth } from '../firebase';

/**
 * Google sign-in on the web.
 *
 * `hd` restricts the account chooser to the Workspace domain. It is a UX
 * convenience ONLY — it is trivially bypassed and is never treated as a check.
 * The real enforcement is the auth-create Cloud Function, plus the Internal
 * OAuth consent screen in front of it. See docs/PRODUCT_BRIEF.md.
 */
export async function signInWithGoogle(): Promise<UserCredential> {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ hd: ALLOWED_EMAIL_DOMAIN, prompt: 'select_account' });
  return signInWithPopup(auth, provider);
}

export const googleSignInAvailable = true;
