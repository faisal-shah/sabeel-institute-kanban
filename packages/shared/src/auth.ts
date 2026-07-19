import { ALLOWED_EMAIL_DOMAIN } from './constants';

/**
 * The server-side domain check. Used by the auth-create Cloud Function to reject
 * accounts outside the Workspace, regardless of what the OAuth consent screen is
 * set to.
 *
 * Deliberately strict:
 *  - an unverified email never passes (Google can hand us an unverified address)
 *  - matching is on the FULL domain after the last `@`, so `evil-oursabeel.com`
 *    and `oursabeel.com.attacker.net` do not slip through a naive `endsWith`
 *  - case-insensitive, since providers vary
 */
export function isAllowedEmail(
  email: string | undefined | null,
  emailVerified: boolean,
): boolean {
  if (!email || !emailVerified) return false;
  const at = email.lastIndexOf('@');
  if (at === -1) return false;
  const domain = email.slice(at + 1).toLowerCase().trim();
  return domain === ALLOWED_EMAIL_DOMAIN;
}
