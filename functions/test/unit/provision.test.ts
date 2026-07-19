import { describe, it, expect } from 'vitest';
import { decideProvision } from '../../src/provision';

describe('decideProvision', () => {
  const good = {
    email: 'someone@oursabeel.com',
    emailVerified: true,
    displayName: 'Some One',
    photoURL: 'https://example.com/a.png',
  };

  it('provisions a verified org address as pending/member', () => {
    const d = decideProvision(good);
    expect(d.action).toBe('provision');
    if (d.action !== 'provision') throw new Error('unreachable');
    expect(d.claims).toEqual({ status: 'pending', role: 'member' });
    expect(d.profile.displayName).toBe('Some One');
    expect(d.profile.email).toBe('someone@oursabeel.com');
  });

  it('never provisions an active account', () => {
    // The whole approval model rests on this: domain match is not approval.
    const d = decideProvision(good);
    if (d.action !== 'provision') throw new Error('unreachable');
    expect(d.claims.status).not.toBe('active');
  });

  it('rejects an unverified org address', () => {
    expect(decideProvision({ ...good, emailVerified: false }).action).toBe('reject');
  });

  it('rejects other domains', () => {
    expect(decideProvision({ ...good, email: 'a@gmail.com' }).action).toBe('reject');
  });

  it('rejects look-alike domains', () => {
    for (const email of [
      'a@evil-oursabeel.com',
      'a@oursabeel.com.attacker.net',
      'a@notoursabeel.com',
    ]) {
      expect(decideProvision({ ...good, email }).action).toBe('reject');
    }
  });

  it('rejects a missing email', () => {
    expect(decideProvision({ ...good, email: null }).action).toBe('reject');
    expect(decideProvision({ emailVerified: true }).action).toBe('reject');
  });

  it('falls back to the local part when Google sends no display name', () => {
    // An empty row in the approval list gives the admin nothing to judge by.
    for (const displayName of [null, '', '   ']) {
      const d = decideProvision({ ...good, displayName });
      if (d.action !== 'provision') throw new Error('unreachable');
      expect(d.profile.displayName).toBe('someone');
    }
  });

  it('tolerates a missing photo', () => {
    const d = decideProvision({ ...good, photoURL: null });
    if (d.action !== 'provision') throw new Error('unreachable');
    expect(d.profile.photoUrl).toBeNull();
  });

  it('reports the offending address on rejection, for the audit log', () => {
    const d = decideProvision({ ...good, email: 'intruder@gmail.com' });
    if (d.action !== 'reject') throw new Error('unreachable');
    expect(d.email).toBe('intruder@gmail.com');
    expect(d.reason).toBe('bad-domain');
  });
});
