import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { adminDb, makeUser, shutdown, waitFor } from './emulatorClient';

/**
 * `lastActivityAt` is what makes Search's "Newest first" mean what it says.
 *
 * `updatedAt` is client-written on a card EDIT, and neither posting a comment
 * nor attaching a file edits a field of the card — so without this a card with
 * ten new comments sat exactly where it was in a list sorted by recency. The
 * two triggers below already wrote to the card document to keep their counts in
 * step; this rides along in the same write.
 *
 * Tested through the emulator rather than by unit test because the whole claim
 * is about a TRIGGER firing: a unit test of the handler would prove the line
 * exists, not that a comment moves the field.
 */
const MGR = 'la_mgr';
const B1 = 'la_b1';
const CARD = 'la_c1';

const board = () => ({
  name: 'Activity',
  description: '',
  archived: false,
  columns: [{ id: 'c1', name: 'To Do' }],
  columnIds: ['c1'],
  memberUids: [MGR],
  memberProfiles: {},
  activeCardCount: 0,
  createdAt: 1,
  createdBy: MGR,
});

const card = () => ({
  boardId: B1,
  title: 'Has a conversation',
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
});

/** Resolves with the field once it is past `after`. */
const waitForActivity = (after: number) =>
  waitFor(`cards/${CARD} lastActivityAt > ${after}`, async () => {
    const d = await adminDb().doc(`cards/${CARD}`).get();
    const at = (d.data()?.lastActivityAt as number | undefined) ?? 0;
    return at > after ? at : undefined;
  });

beforeAll(async () => {
  await makeUser({ uid: MGR, email: `${MGR}@oursabeel.com`, role: 'manager', status: 'active' });
  await adminDb().doc(`boards/${B1}`).set(board());
  await adminDb().doc(`cards/${CARD}`).set(card());
});

afterAll(async () => {
  await shutdown();
});

describe('lastActivityAt', () => {
  it('is absent until something happens, and a card is still readable without it', async () => {
    const d = await adminDb().doc(`cards/${CARD}`).get();
    // No backfill ran, and none was needed: the client falls back to
    // `updatedAt` and then `createdAt`, so an untouched card still sorts.
    expect(d.data()?.lastActivityAt).toBeUndefined();
    expect(d.data()?.updatedAt).toBe(1);
  });

  it('moves when a comment is posted', async () => {
    await adminDb().doc(`cards/${CARD}/comments/la_m1`).set({
      authorUid: MGR,
      body: 'first',
      mentionUids: [],
      createdAt: Date.now(),
    });
    const at = await waitForActivity(0);
    expect(at).toBeGreaterThan(0);

    // And `updatedAt` is untouched — the card itself was not edited, which is
    // the whole reason this field had to exist.
    const d = await adminDb().doc(`cards/${CARD}`).get();
    expect(d.data()?.updatedAt).toBe(1);
    expect(d.data()?.commentCount).toBe(1);
  });

  it('moves again when the comment is deleted', async () => {
    const before = ((await adminDb().doc(`cards/${CARD}`).get()).data()
      ?.lastActivityAt ?? 0) as number;
    await adminDb().doc(`cards/${CARD}/comments/la_m1`).delete();
    // A deletion changes the conversation too, and unlike the `comments`
    // counter beside it there is nothing here to double-count.
    const at = await waitForActivity(before);
    expect(at).toBeGreaterThan(before);
  });
});
