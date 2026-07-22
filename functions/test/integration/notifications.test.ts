import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { adminDb, makeUser, shutdown, waitFor } from './emulatorClient';

// Unique uids so these do not collide with the other trigger suites.
const AUTHOR = 'nt_author';
const MENTIONED = 'nt_mentioned';
const ASSIGNEE = 'nt_assignee';

async function inbox(uid: string, type: string) {
  const snap = await adminDb()
    .collection(`users/${uid}/notifications`)
    .where('type', '==', type)
    .get();
  return snap.docs.map((d) => d.data());
}

async function clearInbox(uid: string) {
  const snap = await adminDb().collection(`users/${uid}/notifications`).get();
  await Promise.all(snap.docs.map((d) => d.ref.delete()));
}

async function comment(body: string, mentionUids: string[]) {
  await adminDb()
    .collection('cards/nt_card/comments')
    .add({ authorUid: AUTHOR, body, mentionUids, createdAt: Date.now() });
}

beforeAll(async () => {
  await makeUser({ uid: AUTHOR, email: `${AUTHOR}@oursabeel.com`, role: 'member', status: 'active', displayName: 'Ada' });
  await makeUser({ uid: MENTIONED, email: `${MENTIONED}@oursabeel.com`, role: 'member', status: 'active', displayName: 'Ben' });
  await makeUser({ uid: ASSIGNEE, email: `${ASSIGNEE}@oursabeel.com`, role: 'member', status: 'active', displayName: 'Cara' });
  await adminDb().doc('boards/nt_b1').set({
    name: 'Ops',
    description: '',
    archived: false,
    columns: [{ id: 'c1', name: 'To Do' }],
    columnIds: ['c1'],
    labels: [],
    memberUids: [AUTHOR, MENTIONED, ASSIGNEE],
    memberProfiles: {},
    createdAt: 1,
    createdBy: AUTHOR,
  });
  await adminDb().doc('cards/nt_card').set({
    boardId: 'nt_b1',
    title: 'Ship it',
    description: '',
    columnId: 'c1',
    rank: 'V',
    assigneeUids: [ASSIGNEE],
    priority: 'none',
    labelIds: [],
    archived: false,
    commentCount: 0,
    createdAt: 1,
    createdBy: AUTHOR,
    updatedAt: 1,
    updatedBy: AUTHOR,
  });
});

afterAll(async () => {
  await shutdown();
});

describe('onCommentCreated notifications', () => {
  it('notifies the mentioned person and the card assignee, but not the author', async () => {
    await Promise.all([clearInbox(MENTIONED), clearInbox(ASSIGNEE), clearInbox(AUTHOR)]);
    await comment('take a look @Ben', [MENTIONED]);

    const mention = await waitFor('mention entry', async () => {
      const e = await inbox(MENTIONED, 'mention');
      return e.length ? e[0] : undefined;
    });
    expect(mention.type).toBe('mention');

    const onMyCard = await waitFor('commentOnMyCard entry', async () => {
      const e = await inbox(ASSIGNEE, 'commentOnMyCard');
      return e.length ? e[0] : undefined;
    });
    expect(onMyCard.type).toBe('commentOnMyCard');

    // Never notify yourself.
    const authorAll = await adminDb().collection(`users/${AUTHOR}/notifications`).get();
    expect(authorAll.empty).toBe(true);
  });

  it('a mention wins over the assignee notification — no double-notify', async () => {
    await clearInbox(ASSIGNEE);
    // The author mentions the ASSIGNEE. They should get a mention, and NOT also a
    // commentOnMyCard for the same comment.
    await comment('over to you @Cara', [ASSIGNEE]);

    await waitFor('assignee mention', async () => {
      const e = await inbox(ASSIGNEE, 'mention');
      return e.length ? e[0] : undefined;
    });
    // The mention has landed; the dedup means no commentOnMyCard was written.
    const onMyCard = await inbox(ASSIGNEE, 'commentOnMyCard');
    expect(onMyCard).toHaveLength(0);
  });
});
