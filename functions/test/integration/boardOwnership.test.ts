import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { adminDb, callFunction, idTokenFor, makeUser, shutdown } from './emulatorClient';

/**
 * The two server-side halves of per-board ownership.
 *
 * Neither is expressible in rules. `removeBoardMember` is an Admin SDK batch that
 * bypasses them entirely — which is exactly why the invariant it maintains
 * cannot be a rule — and `boardsSolelyOwnedBy` is a question the People screen
 * asks before it acts.
 *
 * Unique uids so these do not collide with the other suites sharing the emulator
 * within one `emulators:exec` run.
 */
const OWNER = 'bo_owner';
const SECOND = 'bo_second';
const MEM = 'bo_mem';
const ADMIN = 'bo_admin';

const board = (over: Record<string, unknown> = {}) => ({
  name: 'Ownership',
  description: '',
  archived: false,
  columns: [{ id: 'c1', name: 'To Do' }],
  columnIds: ['c1'],
  memberUids: [OWNER, SECOND, MEM],
  boardOwnerUids: [OWNER],
  memberProfiles: {},
  activeCardCount: 0,
  createdAt: 1,
  createdBy: OWNER,
  ...over,
});

beforeAll(async () => {
  await makeUser({ uid: OWNER, email: `${OWNER}@oursabeel.com`, role: 'member', status: 'active' });
  await makeUser({ uid: SECOND, email: `${SECOND}@oursabeel.com`, role: 'member', status: 'active' });
  await makeUser({ uid: MEM, email: `${MEM}@oursabeel.com`, role: 'member', status: 'active' });
  await makeUser({ uid: ADMIN, email: `${ADMIN}@oursabeel.com`, role: 'admin', status: 'active' });
});

afterAll(async () => {
  await shutdown();
});

describe('removeBoardMember and ownership', () => {
  /**
   * The privilege re-grant this closes.
   *
   * Authority is membership AND ownership, so a leftover owner entry grants
   * nothing while the person is off the board — but `addBoardMember` writes only
   * `memberUids`, so re-adding them later would hand their ownership straight
   * back, with no confirmation and nothing in the activity log. The rules cannot
   * catch it: this removal is an Admin SDK batch and bypasses them.
   */
  it('clears the removed person from boardOwnerUids, not just memberUids', async () => {
    await adminDb()
      .doc('boards/bo_strip')
      .set(board({ boardOwnerUids: [OWNER, SECOND] }));

    const res = await callFunction(
      'removeBoardMember',
      { boardId: 'bo_strip', uid: SECOND },
      await idTokenFor(OWNER),
    );
    expect(res.body.error).toBeUndefined();

    const after = (await adminDb().doc('boards/bo_strip').get()).data();
    expect(after?.memberUids).not.toContain(SECOND);
    expect(after?.boardOwnerUids).not.toContain(SECOND);
    // …and the remaining owner is untouched.
    expect(after?.boardOwnerUids).toContain(OWNER);
  });

  it('re-adding that person does NOT restore their ownership', async () => {
    // The assertion the one above exists for, stated end to end.
    await adminDb()
      .doc('boards/bo_strip2')
      .set(board({ boardOwnerUids: [OWNER, SECOND] }));
    await callFunction(
      'removeBoardMember',
      { boardId: 'bo_strip2', uid: SECOND },
      await idTokenFor(OWNER),
    );
    // addBoardMember is a plain client write of memberUids; imitate it.
    await adminDb()
      .doc('boards/bo_strip2')
      .update({ memberUids: [OWNER, MEM, SECOND] });

    const after = (await adminDb().doc('boards/bo_strip2').get()).data();
    expect(after?.memberUids).toContain(SECOND);
    expect(after?.boardOwnerUids).not.toContain(SECOND);
  });

  it('is refused to a member of the board who does not own it', async () => {
    await adminDb().doc('boards/bo_gate').set(board());
    const res = await callFunction(
      'removeBoardMember',
      { boardId: 'bo_gate', uid: MEM },
      await idTokenFor(MEM),
    );
    expect(res.body.error?.status).toBe('PERMISSION_DENIED');
    // Only board authority was in the way — the owner does it fine.
    const ok = await callFunction(
      'removeBoardMember',
      { boardId: 'bo_gate', uid: MEM },
      await idTokenFor(OWNER),
    );
    expect(ok.body.error).toBeUndefined();
  });

  it('is allowed to an admin who is not on the board at all', async () => {
    await adminDb().doc('boards/bo_admin').set(board());
    const res = await callFunction(
      'removeBoardMember',
      { boardId: 'bo_admin', uid: MEM },
      await idTokenFor(ADMIN),
    );
    expect(res.body.error).toBeUndefined();
  });
});

/**
 * The disable warning.
 *
 * Disabling someone does not touch `boardOwnerUids` — the board keeps its owner,
 * that owner just cannot act — so there is nothing structurally broken to
 * prevent, only a situation to point at. The admin is told and proceeds.
 */
describe('boardsSolelyOwnedBy', () => {
  it('lists boards where this person is the ONLY owner', async () => {
    await adminDb().doc('boards/bo_sole').set(board({ name: 'Solely mine' }));
    await adminDb()
      .doc('boards/bo_shared')
      .set(board({ name: 'Shared', boardOwnerUids: [OWNER, SECOND] }));

    const res = await callFunction(
      'boardsSolelyOwnedBy',
      { uid: OWNER },
      await idTokenFor(ADMIN),
    );
    expect(res.body.error).toBeUndefined();
    const result = res.body.result as { boards: { id: string; name: string }[] };
    const names = result.boards.map((b) => b.name);
    expect(names).toContain('Solely mine');
    // A board with a second owner is not at risk, so it is not worth mentioning.
    expect(names).not.toContain('Shared');
  });

  it('says nothing about someone who owns nothing alone', async () => {
    const res = await callFunction(
      'boardsSolelyOwnedBy',
      { uid: MEM },
      await idTokenFor(ADMIN),
    );
    expect((res.body.result as { boards: unknown[] }).boards).toEqual([]);
  });

  it('is admin-only — it names boards the caller may not be on', async () => {
    const res = await callFunction(
      'boardsSolelyOwnedBy',
      { uid: OWNER },
      await idTokenFor(OWNER),
    );
    expect(res.body.error?.status).toBe('PERMISSION_DENIED');
  });
});
