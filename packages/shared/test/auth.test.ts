import { describe, it, expect } from 'vitest';
import { isAllowedEmail } from '../src/auth';

describe('isAllowedEmail', () => {
  it('accepts a verified address on the org domain', () => {
    expect(isAllowedEmail('someone@oursabeel.com', true)).toBe(true);
  });

  it('is case-insensitive about the domain', () => {
    expect(isAllowedEmail('Someone@OurSabeel.COM', true)).toBe(true);
  });

  it('rejects an unverified address even on the org domain', () => {
    // Google can hand us an unverified address; trusting it would let someone
    // claim an @oursabeel.com identity they do not control.
    expect(isAllowedEmail('someone@oursabeel.com', false)).toBe(false);
  });

  it('rejects other domains', () => {
    expect(isAllowedEmail('someone@gmail.com', true)).toBe(false);
  });

  it('rejects look-alike domains a naive endsWith would let through', () => {
    expect(isAllowedEmail('a@evil-oursabeel.com', true)).toBe(false);
    expect(isAllowedEmail('a@oursabeel.com.attacker.net', true)).toBe(false);
    expect(isAllowedEmail('a@notoursabeel.com', true)).toBe(false);
  });

  it('rejects an address embedding the domain in the local part', () => {
    expect(isAllowedEmail('oursabeel.com@gmail.com', true)).toBe(false);
  });

  it('rejects missing or malformed input', () => {
    expect(isAllowedEmail(undefined, true)).toBe(false);
    expect(isAllowedEmail(null, true)).toBe(false);
    expect(isAllowedEmail('', true)).toBe(false);
    expect(isAllowedEmail('no-at-sign', true)).toBe(false);
  });
});
