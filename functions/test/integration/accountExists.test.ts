import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { adminAuth, callFunction, makeUser, shutdown } from './emulatorClient';

/**
 * The gate that keeps the mobile apps outside both stores' account-creation
 * rule.
 *
 * `signInWithCredential` is the line that would create an account, and the
 * native sign-in path (`app/src/auth/google.ts`) refuses to reach it unless this
 * callable says an account already exists. If this suite goes red, the exemption
 * in `docs/STORE-RELEASE.md` is not true any more and Apple 5.1.1(v) applies.
 *
 * Unique ids (`ae_`) so this does not collide with the other suites sharing one
 * `emulators:exec` run.
 */
const ACTIVE = 'ae_active';
const PENDING = 'ae_pending';
const DISABLED = 'ae_disabled';

const email = (uid: string) => `${uid}@oursabeel.com`;

/**
 * The emulator dialect for an ID token: a plain JSON payload, exactly what
 * `devSignIn.ts` hands `GoogleAuthProvider.credential` on the client. There is
 * no way to mint a Google-signed token in a test, so the callable takes an
 * emulator branch keyed off the project id — see `isEmulatorProject`.
 */
const token = (addr: string, verified = true) =>
  JSON.stringify({ sub: `dev-${addr}`, email: addr, email_verified: verified });

const call = (data: unknown) => callFunction('accountExists', data);

beforeAll(async () => {
  await makeUser({ uid: ACTIVE, email: email(ACTIVE), status: 'active', role: 'member' });
  await makeUser({ uid: PENDING, email: email(PENDING), status: 'pending', role: 'member' });
  await makeUser({ uid: DISABLED, email: email(DISABLED), status: 'disabled', role: 'member' });
}, 60_000);

afterAll(async () => {
  await shutdown();
});

describe('accountExists', () => {
  it('says no for an address with no account — the case that would otherwise create one', async () => {
    const res = await call({ idToken: token('ae_nobody@oursabeel.com') });
    expect(res.status).toBe(200);
    expect(res.body.result).toEqual({ exists: false });
  });

  it('says yes for an active account', async () => {
    const res = await call({ idToken: token(email(ACTIVE)) });
    expect(res.body.result).toEqual({ exists: true });
  });

  /**
   * The two that make the whole design small. Both of these accounts EXIST, so
   * signing them in creates nothing — which is why the app signs them in and
   * lets `App.tsx` route them to the waiting and disabled screens, rather than
   * this callable trying to be an authorisation decision.
   */
  it('says yes for a PENDING account, so the app can show the waiting screen', async () => {
    const res = await call({ idToken: token(email(PENDING)) });
    expect(res.body.result).toEqual({ exists: true });
  });

  it('says yes for a DISABLED account, so the app can show the disabled screen', async () => {
    const res = await call({ idToken: token(email(DISABLED)) });
    expect(res.body.result).toEqual({ exists: true });
  });

  it('answers without any Authorization header — there is no session yet, by definition', async () => {
    // callFunction sends no bearer token unless given one; asserted explicitly
    // because an `unauthenticated` guard slipped in here would lock out every
    // first sign-in on a phone, and nothing else would catch it.
    const res = await call({ idToken: token(email(ACTIVE)) });
    expect(res.status).toBe(200);
    expect(res.body.error).toBeUndefined();
  });

  it('leaks nothing beyond existence', async () => {
    const res = await call({ idToken: token(email(DISABLED)) });
    // Not `toMatchObject` — the point is that role, status, uid, displayName and
    // "why" are all absent. A helpful extra field here is an enumeration oracle.
    expect(Object.keys(res.body.result as object)).toEqual(['exists']);
  });

  it('treats an unverified address as no account, whatever it claims', async () => {
    const res = await call({ idToken: token(email(ACTIVE), false) });
    expect(res.body.result).toEqual({ exists: false });
  });

  it('rejects a token it cannot read', async () => {
    const res = await call({ idToken: 'not-a-token' });
    expect(res.body.error?.status).toBe('UNAUTHENTICATED');
  });

  it('rejects a missing token', async () => {
    expect((await call({})).body.error?.status).toBe('INVALID_ARGUMENT');
    expect((await call({ idToken: '' })).body.error?.status).toBe('INVALID_ARGUMENT');
    expect((await call({ idToken: 42 })).body.error?.status).toBe('INVALID_ARGUMENT');
  });

  it('does not create an account as a side effect of being asked', async () => {
    const addr = 'ae_ghost@oursabeel.com';
    await call({ idToken: token(addr) });
    // The entire compliance claim in one assertion. Matched on the CODE, not the
    // message — Firebase's prose ("There is no user record corresponding…")
    // is not part of any contract.
    await expect(adminAuth().getUserByEmail(addr)).rejects.toMatchObject({
      code: 'auth/user-not-found',
    });
  });
});
