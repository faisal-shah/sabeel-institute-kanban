import { describe, it, beforeAll, afterAll } from 'vitest';
import { adminDb, makeUser, shutdown, waitFor } from './emulatorClient';

// Unique ids so this doesn't collide with the other trigger suites sharing the
// emulator within one `emulators:exec` run.
const MGR = 'bcc_mgr';
const B1 = 'bcc_b1';
const B2 = 'bcc_b2';

const board = () => ({
  name: 'Counting',
  description: '',
  archived: false,
  columns: [{ id: 'c1', name: 'To Do' }],
  columnIds: ['c1'],
  labels: [],
  memberUids: [MGR],
  memberProfiles: {},
  activeCardCount: 0,
  createdAt: 1,
  createdBy: MGR,
});

const card = (over: Record<string, unknown> = {}) => ({
  boardId: B1,
  title: 'x',
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

const waitCount = (boardId: string, want: number) =>
  waitFor(`board ${boardId} activeCardCount == ${want}`, async () => {
    const d = await adminDb().doc(`boards/${boardId}`).get();
    return (d.data()?.activeCardCount ?? 0) === want ? true : undefined;
  });

beforeAll(async () => {
  await makeUser({ uid: MGR, email: `${MGR}@oursabeel.com`, role: 'manager', status: 'active' });
  await adminDb().doc(`boards/${B1}`).set(board());
  await adminDb().doc(`boards/${B2}`).set(board());
});

afterAll(async () => {
  await shutdown();
});

describe('onCardBoardCount', () => {
  it('counts a created card, drops it on archive, restores on unarchive', async () => {
    await adminDb().doc('cards/bcc_c1').set(card());
    await waitCount(B1, 1);

    await adminDb().doc('cards/bcc_c1').update({ archived: true });
    await waitCount(B1, 0);

    await adminDb().doc('cards/bcc_c1').update({ archived: false });
    await waitCount(B1, 1);
  });

  it('moves the count across boards on a cross-board move, and drops it on delete', async () => {
    await adminDb().doc('cards/bcc_c2').set(card());
    await waitCount(B1, 2); // bcc_c1 + bcc_c2

    await adminDb().doc('cards/bcc_c2').update({ boardId: B2 });
    await waitCount(B1, 1);
    await waitCount(B2, 1);

    await adminDb().doc('cards/bcc_c2').delete();
    await waitCount(B2, 0);
  });
});
