import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import {
  doc,
  collection,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
} from 'firebase/firestore';

let env: RulesTestEnvironment;

const ROLES = ['member', 'manager', 'admin'] as const;
const STATUSES = ['pending', 'active', 'rejected', 'disabled'] as const;

function ctx(uid: string, role: string, status: string) {
  return env
    .authenticatedContext(uid, {
      email: `${uid}@oursabeel.com`,
      email_verified: true,
      role,
      status,
    })
    .firestore();
}

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

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore();
    // A representative population: one of each role, plus someone waiting.
    await setDoc(doc(db, 'users/admin1'), {
      displayName: 'Admin One',
      email: 'admin1@oursabeel.com',
      role: 'admin',
      status: 'active',
    });
    await setDoc(doc(db, 'users/manager1'), {
      displayName: 'Manager One',
      email: 'manager1@oursabeel.com',
      role: 'manager',
      status: 'active',
    });
    await setDoc(doc(db, 'users/member1'), {
      displayName: 'Member One',
      email: 'member1@oursabeel.com',
      role: 'member',
      status: 'active',
    });
    await setDoc(doc(db, 'users/pending1'), {
      displayName: 'Pending One',
      email: 'pending1@oursabeel.com',
      role: 'member',
      status: 'pending',
    });
  });
});

describe('deny-by-default floor', () => {
  it('blocks unauthenticated reads and writes anywhere', async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, 'boards/anything')));
    await assertFails(setDoc(doc(db, 'boards/anything'), { name: 'nope' }));
    await assertFails(getDoc(doc(db, 'users/admin1')));
  });

  it('blocks even an active admin from collections no phase has opened yet', async () => {
    // Guards paths that no phase will ever open, so this test does not need
    // rewriting every time a collection is legitimately added. The point is the
    // catch-all `match /{document=**}` still denies by default: anything not
    // deliberately granted stays shut, including for admins.
    const db = ctx('admin1', 'admin', 'active');
    await assertFails(getDoc(doc(db, 'randomCollection/anything')));
    await assertFails(setDoc(doc(db, 'randomCollection/anything'), { x: 1 }));
    await assertFails(getDoc(doc(db, 'boards/b/cards/c1/madeUpSubcollection/x')));
    await assertFails(
      setDoc(doc(db, 'boards/b/cards/c1/madeUpSubcollection/x'), { x: 1 }),
    );
    await assertFails(getDoc(doc(db, 'boards/b/secrets/x')));
  });
});

describe('reading your own user doc', () => {
  it('is allowed for every role x status combination', async () => {
    // Load-bearing for the gate screens: a pending, rejected or disabled user
    // must still be able to read their OWN status, or they would see a blank
    // screen with no explanation of why they cannot get in.
    for (const role of ROLES) {
      for (const status of STATUSES) {
        const uid = `self_${role}_${status}`;
        await env.withSecurityRulesDisabled(async (c) => {
          await setDoc(doc(c.firestore(), `users/${uid}`), { role, status });
        });
        await assertSucceeds(getDoc(doc(ctx(uid, role, status), `users/${uid}`)));
      }
    }
  });
});

describe('reading OTHER user docs', () => {
  it('is allowed only for active admins', async () => {
    for (const role of ROLES) {
      for (const status of STATUSES) {
        const db = ctx(`peeker_${role}_${status}`, role, status);
        const read = getDoc(doc(db, 'users/member1'));
        if (role === 'admin' && status === 'active') {
          await assertSucceeds(read);
        } else {
          await assertFails(read);
        }
      }
    }
  });

  it('lets an active admin list the approval queue', async () => {
    await assertSucceeds(getDocs(collection(ctx('admin1', 'admin', 'active'), 'users')));
  });

  it('refuses the user list to managers and members', async () => {
    await assertFails(getDocs(collection(ctx('manager1', 'manager', 'active'), 'users')));
    await assertFails(getDocs(collection(ctx('member1', 'member', 'active'), 'users')));
  });

  it('refuses the user list to an admin who is not active', async () => {
    // Disabling an admin must actually disable them.
    for (const status of STATUSES.filter((s) => s !== 'active')) {
      await assertFails(getDocs(collection(ctx('admin1', 'admin', status), 'users')));
    }
  });
});

describe('writes to user docs are impossible from any client', () => {
  it('blocks self-escalation of role', async () => {
    // The attack this whole design exists to prevent.
    const db = ctx('member1', 'member', 'active');
    await assertFails(updateDoc(doc(db, 'users/member1'), { role: 'admin' }));
    await assertFails(updateDoc(doc(db, 'users/member1'), { role: 'manager' }));
    // A real status change is blocked too. (Writing a field to the value it
    // ALREADY has is a no-op: `diff().affectedKeys()` reports only keys whose
    // values differ, so such a write changes nothing and is harmless. The rule
    // constrains state transitions, not the shape of the request.)
    await assertFails(updateDoc(doc(db, 'users/member1'), { status: 'disabled' }));
  });

  it('blocks a pending user activating themselves', async () => {
    const db = ctx('pending1', 'member', 'pending');
    await assertFails(updateDoc(doc(db, 'users/pending1'), { status: 'active' }));
  });

  it('blocks a manager promoting someone', async () => {
    const db = ctx('manager1', 'manager', 'active');
    await assertFails(updateDoc(doc(db, 'users/member1'), { role: 'manager' }));
  });

  it('blocks an ADMIN writing user docs directly — it must go through the callable', async () => {
    // Admins are authorised to change access, but not by writing Firestore.
    // Claims and the mirror would drift apart, and claims are what rules trust.
    const db = ctx('admin1', 'admin', 'active');
    await assertFails(updateDoc(doc(db, 'users/member1'), { role: 'manager' }));
    await assertFails(setDoc(doc(db, 'users/newperson'), { role: 'member' }));
    await assertFails(deleteDoc(doc(db, 'users/member1')));
  });

  it('blocks writing profile fields that are not preferences', async () => {
    // displayName and email come from Google; letting people edit them would let
    // someone impersonate a colleague in an admin's approval queue.
    const db = ctx('member1', 'member', 'active');
    await assertFails(updateDoc(doc(db, 'users/member1'), { displayName: 'Renamed' }));
    await assertFails(updateDoc(doc(db, 'users/member1'), { email: 'x@oursabeel.com' }));
  });

  it('blocks tampering with the server audit trail', async () => {
    const db = ctx('member1', 'member', 'active');
    await assertFails(updateDoc(doc(db, 'users/member1'), { accessChangedBy: 'me' }));
  });

  it('blocks smuggling role alongside a legitimate preference change', async () => {
    // hasOnly() is what makes this fail — a whitelist that checked only "may
    // write favourites" would let this through.
    const db = ctx('member1', 'member', 'active');
    await assertFails(
      updateDoc(doc(db, 'users/member1'), {
        favoriteBoardIds: ['b1'],
        role: 'admin',
      }),
    );
  });

  it('blocks editing someone ELSE preferences', async () => {
    const db = ctx('member1', 'member', 'active');
    await assertFails(updateDoc(doc(db, 'users/manager1'), { favoriteBoardIds: ['b1'] }));
  });

  it('blocks creating a user doc for someone who never signed up', async () => {
    const db = ctx('member1', 'member', 'active');
    await assertFails(setDoc(doc(db, 'users/ghost'), { role: 'admin', status: 'active' }));
  });
});

describe('preference self-writes', () => {
  it('an active user may set their own favourites and recents', async () => {
    const db = ctx('member1', 'member', 'active');
    await assertSucceeds(
      updateDoc(doc(db, 'users/member1'), {
        favoriteBoardIds: ['b1'],
        recentBoardIds: ['b1', 'b2'],
      }),
    );
  });

  it('an active user may set notification preferences', async () => {
    const db = ctx('member1', 'member', 'active');
    await assertSucceeds(
      updateDoc(doc(db, 'users/member1'), {
        notifyPrefs: { mention: false },
        mutedBoardIds: ['b1'],
      }),
    );
  });

  it('an active user may NOT write a pushTokens field on their user doc', async () => {
    // Device tokens live in a subcollection, one document per device. The old
    // array field is gone; allowing it back would let a client hold tokens the
    // send path no longer reads, which is silent breakage rather than an error.
    const db = ctx('member1', 'member', 'active');
    await assertFails(updateDoc(doc(db, 'users/member1'), { pushTokens: ['tok'] }));
  });
});

describe('push tokens', () => {
  it('you may register, read back, and remove a token on your own doc', async () => {
    const db = ctx('member1', 'member', 'active');
    const tok = doc(db, 'users/member1/pushTokens/token-abc');
    await assertSucceeds(setDoc(tok, { platform: 'android', updatedAt: 1 }));
    await assertSucceeds(getDoc(tok));
    await assertSucceeds(deleteDoc(tok));
  });

  it('a PENDING user may register a token', async () => {
    // Registration happens at sign-in, before an admin approves the account.
    // Holding a token grants nothing: the send path checks status separately.
    const db = ctx('pending1', 'member', 'pending');
    await assertSucceeds(
      setDoc(doc(db, 'users/pending1/pushTokens/token-p'), { platform: 'android' }),
    );
  });

  it('nobody may write a token onto SOMEONE ELSE (an admin included)', async () => {
    // A token is a capability to notify a specific device. Writing one to
    // another user's collection would redirect their notifications.
    await assertFails(
      setDoc(doc(ctx('member1', 'member', 'active'), 'users/admin1/pushTokens/t'), {
        platform: 'android',
      }),
    );
    await assertFails(
      setDoc(doc(ctx('admin1', 'admin', 'active'), 'users/member1/pushTokens/t'), {
        platform: 'android',
      }),
    );
  });

  it("nobody may READ someone else's tokens", async () => {
    // Which devices a person carries is not admin business.
    await env.withSecurityRulesDisabled(async (c) => {
      await setDoc(doc(c.firestore(), 'users/member1/pushTokens/t'), { platform: 'android' });
    });
    await assertFails(getDoc(doc(ctx('admin1', 'admin', 'active'), 'users/member1/pushTokens/t')));
    await assertFails(getDocs(collection(ctx('manager1', 'manager', 'active'), 'users/member1/pushTokens')));
  });

  it('a PENDING user may not write preferences', async () => {
    // Nothing at all before approval.
    const db = ctx('pending1', 'member', 'pending');
    await assertFails(updateDoc(doc(db, 'users/pending1'), { favoriteBoardIds: ['b1'] }));
  });
});

describe('operator state (meta/*)', () => {
  // The healthCheck canary stores its baseline at `meta/health`. It is operator
  // state, not app data, and is reachable only by the Admin SDK (which bypasses
  // rules). Nothing in firestore.rules matches `meta/**`, so the catch-all
  // `match /{document=**} { allow read, write: if false; }` is what denies it —
  // this pins that the catch-all really is in force, rather than assuming it.
  it('no client may read or write the health baseline, at any role', async () => {
    await env.withSecurityRulesDisabled(async (c) => {
      await setDoc(doc(c.firestore(), 'meta/health'), { counts: { cards: 1 } });
    });
    for (const role of ['member', 'manager', 'admin']) {
      const db = ctx(`${role}1`, role, 'active');
      await assertFails(getDoc(doc(db, 'meta/health')));
      await assertFails(setDoc(doc(db, 'meta/health'), { counts: { cards: 0 } }));
    }
  });
});

describe('test harness', () => {
  it('can bypass rules via withSecurityRulesDisabled', async () => {
    // If this failed, every assertFails above would be vacuously true.
    await env.withSecurityRulesDisabled(async (c) => {
      await setDoc(doc(c.firestore(), 'boards/seeded'), { name: 'ok' });
      expect((await getDoc(doc(c.firestore(), 'boards/seeded'))).exists()).toBe(true);
    });
  });
});
