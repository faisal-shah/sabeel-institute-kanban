import type { Role, UserStatus } from './types';

/**
 * Access-control decisions, as pure functions.
 *
 * These live in shared rather than in the callable so the app can grey out
 * actions using the SAME logic the server enforces — a disabled button and a
 * rejected write should never disagree. The server is still the authority; the
 * client copy is only for affordance.
 */

export const ROLES: readonly Role[] = ['member', 'manager', 'admin'];
export const USER_STATUSES: readonly UserStatus[] = [
  'pending',
  'active',
  'rejected',
  'disabled',
];

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}

export function isUserStatus(value: unknown): value is UserStatus {
  return (
    typeof value === 'string' && (USER_STATUSES as readonly string[]).includes(value)
  );
}

/** What a brand-new account gets. Never active — an admin must approve. */
export const NEW_USER_ACCESS = {
  status: 'pending' as UserStatus,
  role: 'member' as Role,
};

/** Only an active admin administers accounts. */
export function canAdministerUsers(actor: {
  role: Role;
  status: UserStatus;
}): boolean {
  return actor.status === 'active' && actor.role === 'admin';
}

/** Managers and admins may create boards and see/join every board. */
export function canManageBoards(actor: { role: Role; status: UserStatus }): boolean {
  return actor.status === 'active' && (actor.role === 'manager' || actor.role === 'admin');
}

/** Only an approved account may use the app at all. */
export function canUseApp(actor: { status: UserStatus }): boolean {
  return actor.status === 'active';
}

/**
 * Who may CURATE the org-wide label set — rename, recolour, delete.
 *
 * Creating a label is deliberately not gated beyond `canUseApp`: it happens
 * while someone is looking at a card, and it is cheap and reversible. Deleting
 * is neither, because it strips the label off every card on every board — often
 * boards the deleter is not even a member of. Hence the asymmetry, and hence
 * this being its own predicate rather than a bare `canManageBoards` call at the
 * two places that need it.
 */
export function canCurateLabels(actor: { role: Role; status: UserStatus }): boolean {
  return canManageBoards(actor);
}

/**
 * May this actor see and act on things belonging to a board?
 *
 * The exact predicate `firestore.rules` repeats as `onBoard()` for every card
 * subcollection: active, and either a manager — who may join any board — or a
 * listed member.
 *
 * It exists as shared code because the attachment callables have to make the
 * same judgement in TypeScript. Cloud Storage rules cannot read Firestore, so
 * downloading, finalizing and removing an attachment are authorized in a
 * function rather than in a rule; if that copy drifted, a manager would see a
 * remove button and be told permission denied, or worse, the inverse.
 */
export function canAccessBoard(
  actor: { uid: string; role: Role; status: UserStatus },
  board: { memberUids?: readonly string[] },
): boolean {
  if (actor.status !== 'active') return false;
  if (canManageBoards(actor)) return true;
  return (board.memberUids ?? []).includes(actor.uid);
}

export type AccessChangeRejection =
  | 'not-admin'
  | 'self-change'
  | 'invalid-role'
  | 'invalid-status';

/**
 * May `actor` set `target`'s role/status to the requested values?
 *
 * The self-change rule is the important one: an admin editing their own access
 * is how a project ends up with zero admins and no way back in, and it is also
 * the shape of a privilege-escalation bug if the actor check is ever weakened.
 * Admins change other people; the bootstrap script exists for everything else.
 */
export function checkAccessChange(params: {
  actor: { uid: string; role: Role; status: UserStatus };
  targetUid: string;
  nextRole: unknown;
  nextStatus: unknown;
}): { ok: true } | { ok: false; reason: AccessChangeRejection } {
  const { actor, targetUid, nextRole, nextStatus } = params;

  if (!canAdministerUsers(actor)) return { ok: false, reason: 'not-admin' };
  if (actor.uid === targetUid) return { ok: false, reason: 'self-change' };
  if (!isRole(nextRole)) return { ok: false, reason: 'invalid-role' };
  if (!isUserStatus(nextStatus)) return { ok: false, reason: 'invalid-status' };

  return { ok: true };
}

/** Human-readable reason, shared by the callable's error and the UI's message. */
export const ACCESS_CHANGE_MESSAGES: Record<AccessChangeRejection, string> = {
  'not-admin': 'Only an admin can change who has access.',
  'self-change':
    'You cannot change your own role or status. Ask another admin.',
  'invalid-role': 'Unknown role.',
  'invalid-status': 'Unknown status.',
};
