import { describe, it, expect } from 'vitest';
import { ALLOWED_EMAIL_DOMAIN, isAllowedEmail } from '@sabeel/shared';

// Guards the workspace wiring itself: functions must consume @sabeel/shared from
// its built output. If this fails, the esbuild bundle would also fail to resolve
// shared — which is the exact shape of the sibling project's first-deploy break
// (docs/INHERITED-STACK.md, lesson 1).
describe('@sabeel/shared is reachable from functions', () => {
  it('exposes the org domain constant', () => {
    expect(ALLOWED_EMAIL_DOMAIN).toBe('oursabeel.com');
  });

  it('exposes the shared domain check, not a local reimplementation', () => {
    expect(isAllowedEmail('a@oursabeel.com', true)).toBe(true);
    expect(isAllowedEmail('a@elsewhere.com', true)).toBe(false);
  });
});
