import { NEW_USER_ACCESS, isAllowedEmail } from '@sabeel/shared';
import type { Role, UserStatus } from '@sabeel/shared';

/**
 * The decision half of new-user provisioning, kept pure so it can be tested
 * exhaustively without an emulator or the Admin SDK. `auth.ts` performs the
 * effects.
 */

export type ProvisionDecision =
  | { action: 'reject'; reason: 'bad-domain'; email: string | null }
  | {
      action: 'provision';
      claims: { role: Role; status: UserStatus };
      profile: { email: string; displayName: string; photoUrl: string | null };
    };

export function decideProvision(user: {
  email?: string | null;
  emailVerified?: boolean;
  displayName?: string | null;
  photoURL?: string | null;
}): ProvisionDecision {
  const { email, emailVerified = false } = user;

  // The domain gate, and since 2026-07-19 the only one: the consent screen is
  // External, so Google will happily hand us any Google account. Only the client
  // `hd` hint sits in front of this, and that is trivially bypassed. This check
  // must hold entirely on its own.
  if (!isAllowedEmail(email, emailVerified)) {
    return { action: 'reject', reason: 'bad-domain', email: email ?? null };
  }

  return {
    action: 'provision',
    claims: { ...NEW_USER_ACCESS },
    profile: {
      email: email as string,
      // Fall back to the local part rather than showing an empty row in the
      // admin's approval list — they approve people by name and address.
      displayName: user.displayName?.trim() || (email as string).split('@')[0],
      photoUrl: user.photoURL ?? null,
    },
  };
}
