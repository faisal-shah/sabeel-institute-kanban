import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { doc, collection, getDoc, getDocs, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { EMULATOR_PROJECT_ID, STATS_ALL_SCOPE } from '@sabeel/shared';

/**
 * Rules for the server-written `stats` collection.
 *
 * Two things to pin. Reading is ADMIN-ONLY: a per-board bucket is addressed by
 * board id, so while this was open to every manager it was a way to read any board's
 * activity without being on it and without any screen offering it — which stops
 * being tolerable the moment the org role no longer carries sight of every
 * board. And writing is closed to everyone without exception — a client that
 * could write a counter could lie about it, and rules cannot check a count
 * against reality.
 *
 * `assertFails` passes when an operation fails for ANY reason, so every denial
 * is paired with a positive control: the same operation succeeding once the one
 * thing under test is put right. A suite of bare denials proves nothing.
 */
let env: RulesTestEnvironment;

function ctx(uid: string, role: string, status = 'active') {
  return env.authenticatedContext(uid, {
    email: `${uid}@oursabeel.com`,
    email_verified: true,
    role,
    status,
  });
}

const fs = (uid: string, role: string, status = 'active') => ctx(uid, role, status).firestore();

const MONTH = '2026-07';
const bucket = () => ({
  scope: STATS_ALL_SCOPE,
  month: MONTH,
  days: { '28': { cardsCreated: 3, actors: ['ann'] } },
});

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: EMULATOR_PROJECT_ID,
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
    await setDoc(doc(c.firestore(), `stats/${STATS_ALL_SCOPE}/months/${MONTH}`), bucket());
    await setDoc(doc(c.firestore(), `stats/${STATS_ALL_SCOPE}`), {
      bytesStored: 1000,
      filesStored: 2,
    });
    await setDoc(doc(c.firestore(), `stats/board1/months/${MONTH}`), {
      ...bucket(),
      scope: 'board1',
    });
  });
});

describe('reading stats', () => {
  it('lets an admin read the roll-up and a board bucket', async () => {
    await assertSucceeds(
      getDoc(doc(fs('boss', 'admin'), `stats/${STATS_ALL_SCOPE}/months/${MONTH}`)),
    );
    await assertSucceeds(getDoc(doc(fs('boss', 'admin'), `stats/board1/months/${MONTH}`)));
    await assertSucceeds(getDoc(doc(fs('boss', 'admin'), `stats/${STATS_ALL_SCOPE}`)));
  });

  /**
   * ADMIN-ONLY since board authority became per-board.
   *
   * A per-board bucket is addressed by board id, so while this was open to
   * managers it was a way to read any board's activity WITHOUT being on it and
   * without the UI ever offering it — the exact sight of the whole organisation
   * the new model takes away. The screen moved with the rule.
   */
  it('refuses an ORGANIZER, who can no longer see every board', async () => {
    await assertFails(
      getDoc(doc(fs('org', 'organizer'), `stats/${STATS_ALL_SCOPE}/months/${MONTH}`)),
    );
    // Reading a single board's bucket by id is the sharper case: no UI offers it.
    await assertFails(getDoc(doc(fs('org', 'organizer'), `stats/board1/months/${MONTH}`)));
    // Same document, same path, same active status: only the role differs.
    await assertSucceeds(
      getDoc(doc(fs('org', 'admin'), `stats/${STATS_ALL_SCOPE}/months/${MONTH}`)),
    );
  });

  it('refuses a member — and the positive control proves it is the ROLE', async () => {
    // Same document, same path, same active status: only the role differs.
    await assertFails(
      getDoc(doc(fs('mem', 'member'), `stats/${STATS_ALL_SCOPE}/months/${MONTH}`)),
    );
    await assertSucceeds(
      getDoc(doc(fs('mem', 'admin'), `stats/${STATS_ALL_SCOPE}/months/${MONTH}`)),
    );
  });

  it('refuses an admin whose account is not active yet', async () => {
    // A pending account carrying the admin role must still be inert — the
    // domain check is not the approval.
    await assertFails(
      getDoc(doc(fs('new', 'admin', 'pending'), `stats/${STATS_ALL_SCOPE}/months/${MONTH}`)),
    );
    await assertSucceeds(
      getDoc(doc(fs('new', 'admin', 'active'), `stats/${STATS_ALL_SCOPE}/months/${MONTH}`)),
    );
  });

  it('refuses a signed-out reader', async () => {
    await assertFails(
      getDoc(doc(env.unauthenticatedContext().firestore(), `stats/${STATS_ALL_SCOPE}/months/${MONTH}`)),
    );
  });

  it('allows listing a scope’s months, which is how the chart loads', async () => {
    // The screen reads a RANGE of month documents, so `list` has to be allowed
    // and not just `get` — a rule granting only `get` would pass every test
    // above and still leave the chart empty.
    const snap = await assertSucceeds(
      getDocs(collection(fs('boss', 'admin'), `stats/${STATS_ALL_SCOPE}/months`)),
    );
    expect(snap.docs).toHaveLength(1);
  });
});

describe('writing stats', () => {
  it('refuses every client write, including an admin’s', async () => {
    const path = `stats/${STATS_ALL_SCOPE}/months/${MONTH}`;
    await assertFails(setDoc(doc(fs('boss', 'admin'), path), bucket()));
    await assertFails(updateDoc(doc(fs('boss', 'admin'), path), { 'days.28.cardsCreated': 99 }));
    await assertFails(deleteDoc(doc(fs('boss', 'admin'), path)));
    await assertFails(
      setDoc(doc(fs('boss', 'admin'), `stats/${STATS_ALL_SCOPE}`), { bytesStored: 0 }),
    );
    // Positive control for the whole suite: the emulator IS accepting writes to
    // this path when rules are out of the way, so the failures above are the
    // rule talking and not a broken fixture.
    await env.withSecurityRulesDisabled(async (c) => {
      await setDoc(doc(c.firestore(), path), bucket());
    });
  });

  it('refuses an admin inventing a brand-new scope', async () => {
    await assertFails(
      setDoc(doc(fs('boss', 'admin'), `stats/invented/months/${MONTH}`), bucket()),
    );
  });
});
