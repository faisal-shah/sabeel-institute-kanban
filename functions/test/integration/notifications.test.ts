import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { adminDb, makeUser, shutdown, waitFor } from './emulatorClient';

// Unique uids so these do not collide with the other trigger suites.
const AUTHOR = 'nt_author';
const MENTIONED = 'nt_mentioned';
const ASSIGNEE = 'nt_assignee';
const SUBSCRIBER = 'nt_subscriber';

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
  await makeUser({ uid: SUBSCRIBER, email: `${SUBSCRIBER}@oursabeel.com`, role: 'member', status: 'active', displayName: 'Dev' });
  await adminDb().doc('boards/nt_b1').set({
    name: 'Ops',
    description: '',
    archived: false,
    columns: [{ id: 'c1', name: 'To Do' }],
    columnIds: ['c1'],
    memberUids: [AUTHOR, MENTIONED, ASSIGNEE, SUBSCRIBER],
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
    subscriberUids: [SUBSCRIBER],
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

describe('subscribers hear about comments', () => {
  it('notifies someone who subscribed but is not assigned', async () => {
    await clearInbox(SUBSCRIBER);
    await comment('any thoughts?', []);
    const entries = await waitFor('commentOnSubscribed entry', async () => {
      const got = await inbox(SUBSCRIBER, 'commentOnSubscribed');
      return got.length > 0 ? got : undefined;
    });
    expect(entries[0].text).toContain('commented on');
  });

  it('sends ONE notification to someone who is mentioned AND subscribed', async () => {
    // Caring about a card in more ways must not mean being told more times.
    await clearInbox(SUBSCRIBER);
    await comment(`over to you @${SUBSCRIBER}`, [SUBSCRIBER]);
    await waitFor('the mention', async () => {
      const got = await inbox(SUBSCRIBER, 'mention');
      return got.length > 0 ? got : undefined;
    });
    // Give the subscriber branch every chance to fire before asserting absence.
    await new Promise((r) => setTimeout(r, 2500));
    expect(await inbox(SUBSCRIBER, 'commentOnSubscribed')).toHaveLength(0);
  });

  it('sends ONE notification to someone assigned AND subscribed — the SUBSCRIBED one', async () => {
    // The per-card choice outranks the blanket default. Someone who turned off
    // "comments on cards assigned to me" and then subscribed to this one is
    // saying "just this one"; the other order would send them nothing.
    await adminDb()
      .doc('cards/nt_card')
      .update({ subscriberUids: [SUBSCRIBER, ASSIGNEE] });
    await clearInbox(ASSIGNEE);
    await comment('status?', []);
    await waitFor('the subscribed entry', async () => {
      const got = await inbox(ASSIGNEE, 'commentOnSubscribed');
      return got.length > 0 ? got : undefined;
    });
    await new Promise((r) => setTimeout(r, 2500));
    expect(await inbox(ASSIGNEE, 'commentOnMyCard')).toHaveLength(0);
    await adminDb().doc('cards/nt_card').update({ subscriberUids: [SUBSCRIBER] });
  });

  it('still sends the assignee event when they have NOT subscribed', async () => {
    // The positive control for the exclusion above: without it this would be
    // the only assignee path and the swap could silently break it.
    await clearInbox(ASSIGNEE);
    await comment('plain assignee case', []);
    const got = await waitFor('the assignee entry', async () => {
      const e = await inbox(ASSIGNEE, 'commentOnMyCard');
      return e.length > 0 ? e : undefined;
    });
    expect(got).toHaveLength(1);
  });

  it('never notifies the person who wrote the comment', async () => {
    await adminDb()
      .doc('cards/nt_card')
      .update({ subscriberUids: [SUBSCRIBER, AUTHOR] });
    await clearInbox(AUTHOR);
    await comment('thinking out loud', []);
    await waitFor('someone else to have been told', async () => {
      const got = await inbox(SUBSCRIBER, 'commentOnSubscribed');
      return got.length > 0 ? got : undefined;
    });
    expect(await inbox(AUTHOR, 'commentOnSubscribed')).toHaveLength(0);
    await adminDb().doc('cards/nt_card').update({ subscriberUids: [SUBSCRIBER] });
  });
});

describe('mentioning someone by EDITING a comment', () => {
  // The trigger used to be create-only, so an @mention added while editing told
  // that person nothing — the mention was decorative. The app re-derives
  // mentionUids on every edit, so the trigger has to look at writes.
  async function post(body: string, mentionUids: string[]) {
    const ref = await adminDb()
      .collection('cards/nt_card/comments')
      .add({ authorUid: AUTHOR, body, mentionUids, createdAt: Date.now() });
    return ref;
  }

  it('notifies someone first mentioned in an edit', async () => {
    await Promise.all([clearInbox(MENTIONED), clearInbox(ASSIGNEE)]);
    const ref = await post('no mention here', []);
    await waitFor('commentOnMyCard from the create', async () => {
      const e = await inbox(ASSIGNEE, 'commentOnMyCard');
      return e.length ? e[0] : undefined;
    });
    expect(await inbox(MENTIONED, 'mention')).toHaveLength(0);

    await ref.update({ body: 'actually @Ben should see this', mentionUids: [MENTIONED], editedAt: Date.now() });

    const mention = await waitFor('mention from the edit', async () => {
      const e = await inbox(MENTIONED, 'mention');
      return e.length ? e[0] : undefined;
    });
    expect(mention.type).toBe('mention');
  });

  it('does not re-notify someone already mentioned, and edits are not new comments', async () => {
    await Promise.all([clearInbox(MENTIONED), clearInbox(ASSIGNEE)]);
    const ref = await post('hello @Ben', [MENTIONED]);
    await waitFor('the original mention', async () => {
      const e = await inbox(MENTIONED, 'mention');
      return e.length ? e[0] : undefined;
    });
    await clearInbox(MENTIONED);
    await clearInbox(ASSIGNEE);

    // Fixing a typo must not page the thread again.
    await ref.update({ body: 'hello @Ben — typo fixed', mentionUids: [MENTIONED], editedAt: Date.now() });
    await new Promise((r) => setTimeout(r, 4000));
    expect(await inbox(MENTIONED, 'mention')).toHaveLength(0);
    // And an edit is not a new comment, so assignees hear nothing either.
    expect(await inbox(ASSIGNEE, 'commentOnMyCard')).toHaveLength(0);
  });
});

describe('an archived board is quiet', () => {
  // Archiving a board is meant to put it away. It used to hide the board from
  // every list while its cards went on notifying people — an assignment, a
  // comment, a due-soon reminder about work on a board they could no longer
  // open. The check lives in notify(), so every path inherits it.
  const B = 'nt_arch_board';
  const C = 'nt_arch_card';

  it('writes no notification for a comment on a card whose board is archived', async () => {
    await adminDb().doc(`boards/${B}`).set({
      name: 'Put away',
      description: '',
      archived: true,
      columns: [{ id: 'c1', name: 'To Do' }],
      columnIds: ['c1'],
      memberUids: [AUTHOR, ASSIGNEE],
      memberProfiles: {},
      createdAt: 1,
      createdBy: AUTHOR,
    });
    await adminDb().doc(`cards/${C}`).set({
      boardId: B,
      title: 'Old work',
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
    await clearInbox(ASSIGNEE);

    await adminDb()
      .collection(`cards/${C}/comments`)
      .add({ authorUid: AUTHOR, body: 'anyone still on this?', mentionUids: [ASSIGNEE], createdAt: Date.now() });

    // A comment on the LIVE board is the control: it proves the trigger ran at
    // all, so an empty archived-board inbox is silence rather than a no-op.
    await comment('control @Cara', [ASSIGNEE]);
    await waitFor('control mention landed', async () => {
      const e = await inbox(ASSIGNEE, 'mention');
      return e.length ? e[0] : undefined;
    });

    const all = await adminDb().collection(`users/${ASSIGNEE}/notifications`).get();
    const fromArchived = all.docs.filter((d) => d.data().boardId === B);
    expect(fromArchived).toHaveLength(0);
  });
});
