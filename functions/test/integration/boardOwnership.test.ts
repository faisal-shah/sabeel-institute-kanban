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

  /**
   * A card the removed person is BOTH assigned to and subscribed to.
   *
   * Entirely ordinary — being assigned to a card and following its comments is
   * the common case, and the model explicitly allows both at once — but it makes
   * the callable add two writes to the SAME document in one batch, and the two
   * branches that produce them were written independently. If the backend
   * refuses that, the whole removal fails and the person stays on the board with
   * their access intact.
   */
  it('handles a card that is both assigned AND subscribed in one batch', async () => {
    await adminDb().doc('boards/bo_both').set(board());
    await adminDb().doc('cards/bo_both_card').set({
      boardId: 'bo_both',
      title: 'Assigned and followed',
      description: '',
      columnId: 'c1',
      rank: 'V',
      assigneeUids: [SECOND],
      subscriberUids: [SECOND],
      priority: 'none',
      labelIds: [],
      archived: false,
      commentCount: 0,
      createdAt: 1,
      createdBy: OWNER,
      updatedAt: 1,
      updatedBy: OWNER,
    });

    const res = await callFunction(
      'removeBoardMember',
      { boardId: 'bo_both', uid: SECOND },
      await idTokenFor(OWNER),
    );
    expect(res.body.error).toBeUndefined();

    const card = (await adminDb().doc('cards/bo_both_card').get()).data();
    expect(card?.assigneeUids).not.toContain(SECOND);
    expect(card?.subscriberUids).not.toContain(SECOND);
    // The assignee branch stamps the actor so the activity entry names who did
    // it; the subscriber branch deliberately does not touch the card's history.
    expect(card?.updatedBy).toBe(OWNER);
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

  /**
   * CREATOR PROTECTION, ON THE PATH THAT ACTUALLY DECIDES IT.
   *
   * `firestore.rules` refuses a board update that drops `createdBy` from
   * `boardOwnerUids`. Removing them from the board does exactly that — and this
   * callable is an Admin SDK batch, so no rule sees it. Without the check inside
   * the callable, any owner could unseat the person who made the board by
   * "removing" them, and the only thing standing in the way would be a disabled
   * button.
   */
  it('refuses another owner removing the CREATOR', async () => {
    await adminDb()
      .doc('boards/bo_creator')
      .set(board({ boardOwnerUids: [OWNER, SECOND] }));

    const res = await callFunction(
      'removeBoardMember',
      { boardId: 'bo_creator', uid: OWNER },
      await idTokenFor(SECOND),
    );
    expect(res.body.error?.status).toBe('PERMISSION_DENIED');

    // Only the creator's protection was in the way: the same caller removes
    // anyone else on the same board without trouble.
    const ok = await callFunction(
      'removeBoardMember',
      { boardId: 'bo_creator', uid: MEM },
      await idTokenFor(SECOND),
    );
    expect(ok.body.error).toBeUndefined();

    const after = (await adminDb().doc('boards/bo_creator').get()).data();
    expect(after?.memberUids).toContain(OWNER);
    expect(after?.boardOwnerUids).toContain(OWNER);
  });

  it('refuses the creator LEAVING their own board', async () => {
    // Deliberate, and the same sentence as the rule: they cannot step down
    // unaided. One rule with no exceptions, at the price of an admin request.
    await adminDb().doc('boards/bo_leave').set(board());
    const res = await callFunction(
      'removeBoardMember',
      { boardId: 'bo_leave', uid: OWNER },
      await idTokenFor(OWNER),
    );
    expect(res.body.error?.status).toBe('PERMISSION_DENIED');
  });

  it('an admin can remove the creator', async () => {
    await adminDb().doc('boards/bo_creator_admin').set(board());
    const res = await callFunction(
      'removeBoardMember',
      { boardId: 'bo_creator_admin', uid: OWNER },
      await idTokenFor(ADMIN),
    );
    expect(res.body.error).toBeUndefined();

    const after = (await adminDb().doc('boards/bo_creator_admin').get()).data();
    expect(after?.memberUids).not.toContain(OWNER);
    expect(after?.boardOwnerUids).not.toContain(OWNER);
    // And the board is left with nobody able to run it — visible, not silent:
    // the callable logs a warning, and Board settings shows no owner.
    expect(after?.boardOwnerUids).toEqual([]);
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

  /**
   * ARCHIVED boards are left out, deliberately.
   *
   * The warning's job is "these boards will have nobody able to run them", and
   * an archived board has nobody running it either way. Listing them would pad
   * the confirmation with boards the admin's answer does not depend on, which is
   * how a dialog stops being read — so the omission is a product decision and
   * needs an assertion, or a future tidy-up will silently reverse it.
   */
  it('leaves out a board they solely own but which is archived', async () => {
    await adminDb()
      .doc('boards/bo_sole_archived')
      .set(board({ name: 'Put away', archived: true }));

    const res = await callFunction(
      'boardsSolelyOwnedBy',
      { uid: OWNER },
      await idTokenFor(ADMIN),
    );
    const names = (res.body.result as { boards: { name: string }[] }).boards.map((b) => b.name);
    expect(names).not.toContain('Put away');
    // The positive control: the same person's LIVE sole-owned board is listed,
    // so this is the archived flag doing the work and not an empty answer.
    expect(names).toContain('Solely mine');
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

/**
 * Adding somebody, which used to be a plain client write and could not work.
 *
 * `firestore.rules` allows `list` on `users/` to admins alone, so a non-admin
 * owner's directory query was refused and the picker had nothing to show — while
 * the WRITE was permitted the whole time. The bug was never the permission; it
 * was that the read feeding the control was gated more narrowly than the control.
 */
const PENDING = 'bo_pending';

describe('listAddableUsers', () => {
  it('lets a NON-ADMIN OWNER see who could be added — the bug this fixes', async () => {
    await adminDb().doc('boards/bo_add1').set(board({ memberUids: [OWNER] }));
    const res = await callFunction(
      'listAddableUsers',
      { boardId: 'bo_add1' },
      await idTokenFor(OWNER),
    );
    expect(res.status).toBe(200);
    const uids = (res.body.result as { people: { uid: string }[] }).people.map((p) => p.uid);
    expect(uids).toContain(SECOND);
    expect(uids).toContain(MEM);
  });

  it('leaves out people already on the board', async () => {
    await adminDb().doc('boards/bo_add2').set(board({ memberUids: [OWNER, SECOND] }));
    const res = await callFunction(
      'listAddableUsers',
      { boardId: 'bo_add2' },
      await idTokenFor(OWNER),
    );
    const uids = (res.body.result as { people: { uid: string }[] }).people.map((p) => p.uid);
    expect(uids).not.toContain(SECOND);
  });

  it('returns NAMES ONLY — a picker does not need everyone’s address', async () => {
    await adminDb().doc('boards/bo_add3').set(board({ memberUids: [OWNER] }));
    const res = await callFunction(
      'listAddableUsers',
      { boardId: 'bo_add3' },
      await idTokenFor(OWNER),
    );
    const people = (res.body.result as { people: Record<string, unknown>[] }).people;
    expect(people.length).toBeGreaterThan(0);
    // Not toMatchObject: the point is that email, role and status are ABSENT.
    for (const p of people) expect(Object.keys(p).sort()).toEqual(['displayName', 'uid']);
  });

  it('omits accounts that are not active', async () => {
    await makeUser({
      uid: PENDING, email: `${PENDING}@oursabeel.com`, role: 'member', status: 'pending',
    });
    await adminDb().doc('boards/bo_add4').set(board({ memberUids: [OWNER] }));
    const res = await callFunction(
      'listAddableUsers',
      { boardId: 'bo_add4' },
      await idTokenFor(OWNER),
    );
    const uids = (res.body.result as { people: { uid: string }[] }).people.map((p) => p.uid);
    expect(uids).not.toContain(PENDING);
  });

  it('is refused to a member who does not own the board', async () => {
    await adminDb().doc('boards/bo_add5').set(board());
    const res = await callFunction(
      'listAddableUsers',
      { boardId: 'bo_add5' },
      await idTokenFor(MEM),
    );
    expect(res.body.error?.status).toBe('PERMISSION_DENIED');
  });
});

describe('addBoardMember', () => {
  it('lets a non-admin owner add somebody', async () => {
    await adminDb().doc('boards/bo_put1').set(board({ memberUids: [OWNER] }));
    const res = await callFunction(
      'addBoardMember',
      { boardId: 'bo_put1', uid: MEM },
      await idTokenFor(OWNER),
    );
    expect(res.status).toBe(200);
    const after = (await adminDb().doc('boards/bo_put1').get()).data();
    expect(after?.memberUids).toContain(MEM);
  });

  /**
   * The profile is the SERVER'S copy. Board update validates `memberProfiles`
   * only as `is map` and rules cannot cross-reference `users/`, so while the
   * client supplied it an owner could write any name or address against a uid.
   */
  it('writes the profile from users/, ignoring anything the caller sends', async () => {
    await adminDb().doc('boards/bo_put2').set(board({ memberUids: [OWNER] }));
    await callFunction(
      'addBoardMember',
      { boardId: 'bo_put2', uid: MEM, displayName: 'Someone Else', email: 'evil@example.com' },
      await idTokenFor(OWNER),
    );
    const profiles = (await adminDb().doc('boards/bo_put2').get()).data()?.memberProfiles ?? {};
    expect(profiles[MEM].email).toBe(`${MEM}@oursabeel.com`);
    expect(profiles[MEM].email).not.toBe('evil@example.com');
    expect(profiles[MEM].displayName).not.toBe('Someone Else');
  });

  it('refuses an account that is not active — the approval queue is not routable around', async () => {
    await adminDb().doc('boards/bo_put3').set(board({ memberUids: [OWNER] }));
    const res = await callFunction(
      'addBoardMember',
      { boardId: 'bo_put3', uid: PENDING },
      await idTokenFor(OWNER),
    );
    expect(res.body.error?.status).toBe('FAILED_PRECONDITION');
  });

  it('is refused to a member who does not own the board', async () => {
    await adminDb().doc('boards/bo_put4').set(board({ memberUids: [OWNER, MEM] }));
    const res = await callFunction(
      'addBoardMember',
      { boardId: 'bo_put4', uid: SECOND },
      await idTokenFor(MEM),
    );
    expect(res.body.error?.status).toBe('PERMISSION_DENIED');
  });

  it('is idempotent — two owners tapping the same name is ordinary', async () => {
    await adminDb().doc('boards/bo_put5').set(board({ memberUids: [OWNER] }));
    const tok = await idTokenFor(OWNER);
    const a = await callFunction('addBoardMember', { boardId: 'bo_put5', uid: MEM }, tok);
    const b = await callFunction('addBoardMember', { boardId: 'bo_put5', uid: MEM }, tok);
    expect((a.body.result as { added: boolean }).added).toBe(true);
    expect((b.body.result as { added: boolean }).added).toBe(false);
    const after = (await adminDb().doc('boards/bo_put5').get()).data();
    expect((after?.memberUids as string[]).filter((u) => u === MEM)).toHaveLength(1);
  });
});
