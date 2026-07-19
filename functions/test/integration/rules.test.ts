import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  initializeTestEnvironment,
  assertFails,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { doc, getDoc, setDoc } from 'firebase/firestore';

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-sabeel-kanban',
    firestore: {
      rules: readFileSync('../firestore.rules', 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });
});

afterAll(async () => {
  await env?.cleanup();
});

// Phase 0 posture: nothing is allowed to anyone. Each phase adds allows and the
// tests that pin them down; this file proves the deny-by-default floor exists,
// so a later `match` at the wrong nesting level fails loudly instead of silently
// inheriting an allow.
describe('deny-by-default', () => {
  it('blocks an unauthenticated read', async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, 'boards/anything')));
  });

  it('blocks an unauthenticated write', async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertFails(setDoc(doc(db, 'boards/anything'), { name: 'nope' }));
  });

  it('blocks a signed-in but unapproved user', async () => {
    // The shape of every new account: signed in on the org domain, awaiting an
    // admin. Domain membership alone must grant nothing.
    const db = env
      .authenticatedContext('pending-user', {
        email: 'newbie@oursabeel.com',
        email_verified: true,
        status: 'pending',
        role: 'member',
      })
      .firestore();
    await assertFails(getDoc(doc(db, 'boards/anything')));
    await assertFails(setDoc(doc(db, 'boards/anything'), { name: 'nope' }));
  });

  it('blocks even an active admin, since no path is open yet', async () => {
    const db = env
      .authenticatedContext('admin-user', {
        email: 'boss@oursabeel.com',
        email_verified: true,
        status: 'active',
        role: 'admin',
      })
      .firestore();
    await assertFails(getDoc(doc(db, 'boards/anything')));
  });

  it('blocks writes to the users collection from the client', async () => {
    // Role and status are claims set only by the admin-only setUserAccess
    // callable. A client must never be able to write its own user doc.
    const db = env
      .authenticatedContext('self', {
        email: 'self@oursabeel.com',
        email_verified: true,
        status: 'active',
        role: 'member',
      })
      .firestore();
    await assertFails(setDoc(doc(db, 'users/self'), { role: 'admin' }));
  });
});

// Sanity check that the harness itself works — if assertFails passed against a
// broken emulator connection, every test above would be vacuous.
describe('test harness', () => {
  it('can bypass rules via withSecurityRulesDisabled', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'boards/seeded'), { name: 'ok' });
      const snap = await getDoc(doc(ctx.firestore(), 'boards/seeded'));
      expect(snap.exists()).toBe(true);
    });
  });
});
