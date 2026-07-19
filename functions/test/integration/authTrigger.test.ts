import { describe, it, expect, afterAll, beforeEach } from 'vitest';
import {
  adminAuth,
  adminDb,
  makeUser,
  shutdown,
  waitFor,
  waitUntilGone,
} from './emulatorClient';

/**
 * The real auth-create trigger, running in the functions emulator.
 *
 * This is the Phase 1 security exit criterion: a non-@oursabeel.com account must
 * be rejected BY THE FUNCTION, independently of the OAuth consent screen. These
 * tests create users through the Admin SDK, which bypasses the consent screen
 * entirely — exactly the bypass the check has to survive.
 */

async function userExists(uid: string): Promise<boolean> {
  try {
    await adminAuth().getUser(uid);
    return true;
  } catch {
    return false;
  }
}

beforeEach(async () => {
  const { users } = await adminAuth().listUsers(1000);
  await Promise.all(users.map((u) => adminAuth().deleteUser(u.uid).catch(() => {})));
  const docs = await adminDb().collection('users').listDocuments();
  await Promise.all(docs.map((d) => d.delete()));
});

afterAll(async () => {
  await shutdown();
});

describe('domain enforcement (consent screen bypassed)', () => {
  it('deletes an account created with a non-org address', async () => {
    await adminAuth().createUser({
      uid: 'intruder',
      email: 'intruder@gmail.com',
      emailVerified: true,
    });

    await waitUntilGone('intruder to be deleted', () => userExists('intruder'));
    expect(await userExists('intruder')).toBe(false);
  });

  it('writes no user doc for a rejected address', async () => {
    await adminAuth().createUser({
      uid: 'intruder2',
      email: 'intruder2@gmail.com',
      emailVerified: true,
    });
    await waitUntilGone('intruder2 to be deleted', () => userExists('intruder2'));

    const snap = await adminDb().doc('users/intruder2').get();
    expect(snap.exists).toBe(false);
  });

  it('rejects look-alike domains', async () => {
    // The check must not be a naive endsWith.
    const cases = [
      ['lookalike1', 'a@evil-oursabeel.com'],
      ['lookalike2', 'a@oursabeel.com.attacker.net'],
    ] as const;

    for (const [uid, email] of cases) {
      await adminAuth().createUser({ uid, email, emailVerified: true });
      await waitUntilGone(`${uid} to be deleted`, () => userExists(uid));
      expect(await userExists(uid), `${email} should have been rejected`).toBe(false);
    }
  });

  it('rejects an unverified org address', async () => {
    await adminAuth().createUser({
      uid: 'unverified',
      email: 'unverified@oursabeel.com',
      emailVerified: false,
    });
    await waitUntilGone('unverified to be deleted', () => userExists('unverified'));
    expect(await userExists('unverified')).toBe(false);
  });
});

describe('provisioning a valid org account', () => {
  it('creates the user doc as pending/member', async () => {
    await adminAuth().createUser({
      uid: 'newbie',
      email: 'newbie@oursabeel.com',
      emailVerified: true,
      displayName: 'New Bie',
    });

    const snap = await waitFor('newbie user doc', async () => {
      const s = await adminDb().doc('users/newbie').get();
      return s.exists ? s : undefined;
    });

    const data = snap.data()!;
    expect(data.status).toBe('pending');
    expect(data.role).toBe('member');
    expect(data.email).toBe('newbie@oursabeel.com');
    expect(data.displayName).toBe('New Bie');
    expect(await userExists('newbie')).toBe(true);
  });

  it('sets pending/member custom claims, not just the doc', async () => {
    // Rules trust the TOKEN. A doc without matching claims would be a user the
    // admin screen shows as pending but who is invisible to every rule.
    await adminAuth().createUser({
      uid: 'claimcheck',
      email: 'claimcheck@oursabeel.com',
      emailVerified: true,
    });

    const claims = await waitFor('claimcheck claims', async () => {
      const u = await adminAuth().getUser('claimcheck');
      return u.customClaims?.status ? u.customClaims : undefined;
    });

    expect(claims).toMatchObject({ status: 'pending', role: 'member' });
  });

  it('never provisions an active account, even on the org domain', async () => {
    // Domain match is not approval — this is the core of the access model.
    await adminAuth().createUser({
      uid: 'orgperson',
      email: 'orgperson@oursabeel.com',
      emailVerified: true,
    });

    const snap = await waitFor('orgperson user doc', async () => {
      const s = await adminDb().doc('users/orgperson').get();
      return s.exists ? s : undefined;
    });
    expect(snap.data()!.status).toBe('pending');

    const u = await adminAuth().getUser('orgperson');
    expect(u.customClaims?.status).toBe('pending');
  });

  it('falls back to the email local part when Google sends no display name', async () => {
    await adminAuth().createUser({
      uid: 'nameless',
      email: 'nameless@oursabeel.com',
      emailVerified: true,
    });

    const snap = await waitFor('nameless user doc', async () => {
      const s = await adminDb().doc('users/nameless').get();
      return s.exists ? s : undefined;
    });
    expect(snap.data()!.displayName).toBe('nameless');
  });
});

describe('makeUser helper', () => {
  it('can force a role for later tests', async () => {
    await makeUser({
      uid: 'forcedadmin',
      email: 'forcedadmin@oursabeel.com',
      role: 'admin',
      status: 'active',
    });
    const u = await adminAuth().getUser('forcedadmin');
    expect(u.customClaims).toMatchObject({ role: 'admin', status: 'active' });
  });
});
