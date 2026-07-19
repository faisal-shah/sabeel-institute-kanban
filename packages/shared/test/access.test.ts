import { describe, it, expect } from 'vitest';
import {
  ROLES,
  USER_STATUSES,
  NEW_USER_ACCESS,
  canAdministerUsers,
  canManageBoards,
  canUseApp,
  checkAccessChange,
  isRole,
  isUserStatus,
} from '../src/access';
import type { Role, UserStatus } from '../src/types';

describe('new user defaults', () => {
  it('never provisions an active account', () => {
    // Every account — org domain included — waits for an admin.
    expect(NEW_USER_ACCESS.status).toBe('pending');
    expect(NEW_USER_ACCESS.role).toBe('member');
    expect(canUseApp(NEW_USER_ACCESS)).toBe(false);
  });
});

describe('capability checks across the full role x status matrix', () => {
  const cases: Array<{
    role: Role;
    status: UserStatus;
    useApp: boolean;
    boards: boolean;
    admin: boolean;
  }> = [
    { role: 'member', status: 'pending', useApp: false, boards: false, admin: false },
    { role: 'member', status: 'active', useApp: true, boards: false, admin: false },
    { role: 'member', status: 'rejected', useApp: false, boards: false, admin: false },
    { role: 'member', status: 'disabled', useApp: false, boards: false, admin: false },
    { role: 'manager', status: 'pending', useApp: false, boards: false, admin: false },
    { role: 'manager', status: 'active', useApp: true, boards: true, admin: false },
    { role: 'manager', status: 'rejected', useApp: false, boards: false, admin: false },
    { role: 'manager', status: 'disabled', useApp: false, boards: false, admin: false },
    { role: 'admin', status: 'pending', useApp: false, boards: false, admin: false },
    { role: 'admin', status: 'active', useApp: true, boards: true, admin: true },
    { role: 'admin', status: 'rejected', useApp: false, boards: false, admin: false },
    { role: 'admin', status: 'disabled', useApp: false, boards: false, admin: false },
  ];

  it('covers every combination', () => {
    expect(cases).toHaveLength(ROLES.length * USER_STATUSES.length);
  });

  for (const c of cases) {
    it(`${c.role}/${c.status}`, () => {
      expect(canUseApp(c)).toBe(c.useApp);
      expect(canManageBoards(c)).toBe(c.boards);
      expect(canAdministerUsers(c)).toBe(c.admin);
    });
  }

  it('a non-active admin has no powers at all', () => {
    // Disabling an admin must actually disable them — role alone grants nothing.
    for (const status of USER_STATUSES.filter((s) => s !== 'active')) {
      expect(canAdministerUsers({ role: 'admin', status })).toBe(false);
      expect(canManageBoards({ role: 'admin', status })).toBe(false);
    }
  });
});

describe('checkAccessChange', () => {
  const admin = { uid: 'admin1', role: 'admin' as Role, status: 'active' as UserStatus };

  it('lets an active admin approve someone else', () => {
    expect(
      checkAccessChange({
        actor: admin,
        targetUid: 'someone',
        nextRole: 'member',
        nextStatus: 'active',
      }),
    ).toEqual({ ok: true });
  });

  it('lets an admin promote someone else to admin', () => {
    expect(
      checkAccessChange({
        actor: admin,
        targetUid: 'someone',
        nextRole: 'admin',
        nextStatus: 'active',
      }).ok,
    ).toBe(true);
  });

  it('refuses a member trying to escalate themselves', () => {
    expect(
      checkAccessChange({
        actor: { uid: 'u1', role: 'member', status: 'active' },
        targetUid: 'u2',
        nextRole: 'admin',
        nextStatus: 'active',
      }),
    ).toEqual({ ok: false, reason: 'not-admin' });
  });

  it('refuses a manager administering users', () => {
    // Managers run boards; only admins decide who is in the org.
    expect(
      checkAccessChange({
        actor: { uid: 'm1', role: 'manager', status: 'active' },
        targetUid: 'u2',
        nextRole: 'member',
        nextStatus: 'active',
      }),
    ).toEqual({ ok: false, reason: 'not-admin' });
  });

  it('refuses a pending admin — status gates the role', () => {
    expect(
      checkAccessChange({
        actor: { uid: 'a1', role: 'admin', status: 'pending' },
        targetUid: 'u2',
        nextRole: 'member',
        nextStatus: 'active',
      }),
    ).toEqual({ ok: false, reason: 'not-admin' });
  });

  it('refuses an admin changing their own access', () => {
    // Guards against an admin locking themselves out, and against the shape of
    // a self-escalation bug if the actor check ever weakens.
    expect(
      checkAccessChange({
        actor: admin,
        targetUid: admin.uid,
        nextRole: 'member',
        nextStatus: 'disabled',
      }),
    ).toEqual({ ok: false, reason: 'self-change' });
  });

  it('rejects unknown roles and statuses rather than coercing them', () => {
    expect(
      checkAccessChange({
        actor: admin,
        targetUid: 'u2',
        nextRole: 'superadmin',
        nextStatus: 'active',
      }),
    ).toEqual({ ok: false, reason: 'invalid-role' });

    expect(
      checkAccessChange({
        actor: admin,
        targetUid: 'u2',
        nextRole: 'member',
        nextStatus: 'approved',
      }),
    ).toEqual({ ok: false, reason: 'invalid-status' });
  });

  it('rejects non-string junk', () => {
    for (const junk of [null, undefined, 1, {}, [], true]) {
      expect(
        checkAccessChange({
          actor: admin,
          targetUid: 'u2',
          nextRole: junk,
          nextStatus: 'active',
        }).ok,
      ).toBe(false);
    }
  });
});

describe('type guards', () => {
  it('accepts known values', () => {
    expect(ROLES.every(isRole)).toBe(true);
    expect(USER_STATUSES.every(isUserStatus)).toBe(true);
  });

  it('rejects unknown values', () => {
    expect(isRole('owner')).toBe(false);
    expect(isUserStatus('approved')).toBe(false);
    expect(isRole(undefined)).toBe(false);
  });
});
