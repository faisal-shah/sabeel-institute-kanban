import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import {
  adminDb,
  callFunction,
  idTokenFor,
  makeUser,
  shutdown,
  waitFor,
  waitUntilGone,
} from './emulatorClient';

// Unique uids so these do not collide with the other trigger suites sharing the
// emulator within one `emulators:exec` run.
const MGR = 'ct_mgr';
const MEM = 'ct_mem';

const board = (over: Record<string, unknown> = {}) => ({
  name: 'Ops',
  description: '',
  archived: false,
  columns: [{ id: 'c1', name: 'To Do' }],
  columnIds: ['c1'],
  labels: [],
  memberUids: [MGR, MEM],
  memberProfiles: {},
  createdAt: 1,
  createdBy: MGR,
  ...over,
});

const card = (over: Record<string, unknown> = {}) => ({
  boardId: 'ct_b1',
  title: 'Ship it',
  description: '',
  columnId: 'c1',
  rank: 'V',
  assigneeUids: [],
  priority: 'none',
  labelIds: [],
  archived: false,
  commentCount: 0,
  createdAt: 1,
  createdBy: MGR,
  updatedAt: 1,
  updatedBy: MGR,
  ...over,
});

beforeAll(async () => {
  await makeUser({ uid: MGR, email: `${MGR}@oursabeel.com`, role: 'manager', status: 'active' });
  await makeUser({ uid: MEM, email: `${MEM}@oursabeel.com`, role: 'member', status: 'active' });
  await adminDb().doc('boards/ct_b1').set(board());
});

afterAll(async () => {
  await shutdown();
});

describe('onCardDeleted cascade', () => {
  it("deletes a card's comments and activity when the card is deleted", async () => {
    await adminDb().doc('cards/ct_del').set(card());
    // Wait for onCardWritten to record the 'created' entry, so no late activity
    // write can race the delete below.
    await waitFor('created activity', async () => {
      const snap = await adminDb().collection('cards/ct_del/activity').get();
      return snap.empty ? undefined : true;
    });
    await adminDb()
      .collection('cards/ct_del/comments')
      .add({ authorUid: MGR, body: 'a thread', mentionUids: [], createdAt: 1 });

    await adminDb().doc('cards/ct_del').delete();

    // onCardDeleted recursiveDeletes the subcollections left behind.
    await waitUntilGone('card subcollections', async () => {
      const c = await adminDb().collection('cards/ct_del/comments').get();
      const a = await adminDb().collection('cards/ct_del/activity').get();
      return !c.empty || !a.empty;
    });
  });
});

describe('removeBoardMember activity attribution', () => {
  it('attributes the unassignment to the manager who removed the member', async () => {
    // A card assigned to MEM, last touched by MEM — so the ONLY way the activity
    // entry can name MGR is if removeBoardMember stamps updatedBy correctly.
    await adminDb()
      .doc('cards/ct_unassign')
      .set(card({ assigneeUids: [MEM], createdBy: MEM, updatedBy: MEM }));
    await waitFor('created activity', async () => {
      const snap = await adminDb().collection('cards/ct_unassign/activity').get();
      return snap.empty ? undefined : true;
    });

    const token = await idTokenFor(MGR);
    const res = await callFunction('removeBoardMember', { boardId: 'ct_b1', uid: MEM }, token);
    expect(res.status).toBe(200);

    const entry = await waitFor('unassigned activity', async () => {
      const snap = await adminDb()
        .collection('cards/ct_unassign/activity')
        .where('type', '==', 'unassigned')
        .get();
      return snap.empty ? undefined : snap.docs[0].data();
    });
    expect(entry.actorUid).toBe(MGR);
    expect(entry.to).toBe(MEM);
  });
});
