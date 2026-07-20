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

/**
 * Fresh uid AND email per case. The trigger deletes rejected accounts
 * asynchronously, so reusing fixed identifiers races with that deletion and
 * fails with "Unable to create the user record provided" — a confusing message
 * for what is really a leftover from the previous run.
 */
let seq = 0;
/**
 * Returns ONLY the fields `createUser` accepts, so call sites can spread it
 * safely. An extra property here (an earlier version leaked a `localPart`) makes
 * the Admin SDK reject the whole request with the unhelpfully generic "Unable to
 * create the user record provided".
 */
function fresh(name: string, domain: string): { uid: string; email: string } {
  const tag = `${name}_${Date.now().toString(36)}_${seq++}`;
  return { uid: tag, email: `${tag}@${domain}` };
}

/** The part before the @ — what the trigger falls back to for a display name. */
const localPartOf = (email: string) => email.slice(0, email.indexOf('@'));

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
    const u = fresh('intruder', 'gmail.com');
    await adminAuth().createUser({ ...u, emailVerified: true });

    await waitUntilGone('the intruder to be deleted', () => userExists(u.uid));
    expect(await userExists(u.uid)).toBe(false);
  });

  it('writes no user doc for a rejected address', async () => {
    const u = fresh('intruder', 'gmail.com');
    await adminAuth().createUser({ ...u, emailVerified: true });
    await waitUntilGone('the intruder to be deleted', () => userExists(u.uid));

    // Poll rather than assert once. The auth user disappearing does not mean
    // every effect of the trigger has settled: a doc write already in flight can
    // land microseconds after the delete, and asserting on that instant makes
    // this test fail intermittently for a reason that is not a defect. What
    // matters is that no user doc SURVIVES.
    await waitUntilGone(
      'no user doc to remain for the intruder',
      async () => (await adminDb().doc(`users/${u.uid}`).get()).exists,
    );
  });

  it('rejects look-alike domains', async () => {
    // The check must not be a naive endsWith.
    for (const domain of ['evil-oursabeel.com', 'oursabeel.com.attacker.net']) {
      const u = fresh('lookalike', domain);
      await adminAuth().createUser({ ...u, emailVerified: true });
      await waitUntilGone(`${u.email} to be deleted`, () => userExists(u.uid));
      expect(await userExists(u.uid), `${u.email} should have been rejected`).toBe(
        false,
      );
    }
  });

  it('rejects an unverified org address', async () => {
    // Google can hand us an unverified address; trusting it would let someone
    // claim an @oursabeel.com identity they do not control.
    const u = fresh('unverified', 'oursabeel.com');
    await adminAuth().createUser({ ...u, emailVerified: false });

    await waitUntilGone('the unverified account to be deleted', () =>
      userExists(u.uid),
    );
    expect(await userExists(u.uid)).toBe(false);
  });
});

describe('provisioning a valid org account', () => {
  it('creates the user doc as pending/member', async () => {
    const u = fresh('newbie', 'oursabeel.com');
    await adminAuth().createUser({
      ...u,
      emailVerified: true,
      displayName: 'New Bie',
    });

    const snap = await waitFor('the new user doc', async () => {
      const s = await adminDb().doc(`users/${u.uid}`).get();
      return s.exists ? s : undefined;
    });

    const data = snap.data()!;
    expect(data.status).toBe('pending');
    expect(data.role).toBe('member');
    expect(data.email).toBe(u.email);
    expect(data.displayName).toBe('New Bie');
    expect(await userExists(u.uid)).toBe(true);
  });

  it('sets pending/member custom claims, not just the doc', async () => {
    // Rules trust the TOKEN. A doc without matching claims would be a user the
    // admin screen shows as pending but who is invisible to every rule.
    const u = fresh('claimcheck', 'oursabeel.com');
    await adminAuth().createUser({ ...u, emailVerified: true });

    const claims = await waitFor('the new claims', async () => {
      const rec = await adminAuth().getUser(u.uid);
      return rec.customClaims?.status ? rec.customClaims : undefined;
    });

    expect(claims).toMatchObject({ status: 'pending', role: 'member' });
  });

  it('never provisions an active account, even on the org domain', async () => {
    // Domain match is not approval — this is the core of the access model.
    const u = fresh('orgperson', 'oursabeel.com');
    await adminAuth().createUser({ ...u, emailVerified: true });

    const snap = await waitFor('the new user doc', async () => {
      const s = await adminDb().doc(`users/${u.uid}`).get();
      return s.exists ? s : undefined;
    });
    expect(snap.data()!.status).toBe('pending');
    expect((await adminAuth().getUser(u.uid)).customClaims?.status).toBe('pending');
  });

  it('falls back to the email local part when Google sends no display name', async () => {
    // An empty row in the approval list gives the admin nothing to judge by.
    const u = fresh('nameless', 'oursabeel.com');
    await adminAuth().createUser({ ...u, emailVerified: true });

    const snap = await waitFor('the new user doc', async () => {
      const s = await adminDb().doc(`users/${u.uid}`).get();
      return s.exists ? s : undefined;
    });
    expect(snap.data()!.displayName).toBe(localPartOf(u.email));
  });
});

describe('makeUser helper', () => {
  it('can force a role for later tests', async () => {
    const u = fresh('forcedadmin', 'oursabeel.com');
    await makeUser({ uid: u.uid, email: u.email, role: 'admin', status: 'active' });
    const rec = await adminAuth().getUser(u.uid);
    expect(rec.customClaims).toMatchObject({ role: 'admin', status: 'active' });
  });
});
