import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { NOTIFICATION_RETENTION_DAYS } from '@sabeel/shared';
import { adminDb, makeUser, shutdown } from './emulatorClient';
import { runNotificationSweep } from '../../src/notifications';

/**
 * The weekly inbox sweep, against a real database.
 *
 * The scheduled function itself never runs here — there is no pubsub emulator,
 * which is exactly why the body lives in `runNotificationSweep` (same split as
 * `runHealthCheck`).
 *
 * What matters and cannot be reasoned about: that the age query actually
 * selects the right documents, and that `unreadNotifCount` ends up telling the
 * truth. A badge counting documents that no longer exist is the bug this
 * project has already shipped once, by a different route.
 */
const U = 'sw_user';
const DAY = 24 * 60 * 60 * 1000;

async function inboxSize(uid: string) {
  return (await adminDb().collection(`users/${uid}/notifications`).get()).size;
}

async function badge(uid: string) {
  const snap = await adminDb().doc(`users/${uid}`).get();
  return snap.data()?.unreadNotifCount;
}

async function put(uid: string, id: string, at: number, read: boolean) {
  await adminDb().doc(`users/${uid}/notifications/${id}`).set({
    type: 'assigned',
    boardId: 'sw_b',
    actorUid: 'someone',
    text: 'something happened',
    read,
    at,
  });
}

beforeAll(async () => {
  await makeUser({
    uid: U,
    email: `${U}@oursabeel.com`,
    role: 'member',
    status: 'active',
    displayName: 'Sweep',
  });
});

afterAll(async () => {
  await shutdown();
});

describe('the weekly notification sweep', () => {
  it('removes entries past the retention window and keeps the rest', async () => {
    const now = Date.now();
    const old = now - (NOTIFICATION_RETENTION_DAYS + 5) * DAY;
    const recent = now - 3 * DAY;

    await put(U, 'sw_old_read', old, true);
    await put(U, 'sw_old_unread', old, false);
    await put(U, 'sw_recent_read', recent, true);
    await put(U, 'sw_recent_unread', recent, false);
    // The badge as the increment-based path would have left it: both unread.
    await adminDb().doc(`users/${U}`).update({ unreadNotifCount: 2 });

    expect(await inboxSize(U)).toBe(4);

    await runNotificationSweep(now);

    expect(await inboxSize(U)).toBe(2);
    const left = await adminDb().collection(`users/${U}/notifications`).get();
    expect(left.docs.map((d) => d.id).sort()).toEqual([
      'sw_recent_read',
      'sw_recent_unread',
    ]);

    // The deleted entry was unread, so the badge must have been RECOMPUTED —
    // one unread survives. Left alone it would still say 2, counting a document
    // nobody can open or dismiss.
    expect(await badge(U)).toBe(1);
  });

  it('is a no-op when nothing is old enough, and leaves the badge alone', async () => {
    const now = Date.now();
    await adminDb().doc(`users/${U}`).update({ unreadNotifCount: 7 });

    const result = await runNotificationSweep(now);

    expect(result.deleted).toBe(0);
    expect(await inboxSize(U)).toBe(2);
    // Deliberately NOT recomputed: the sweep only touches the count when it has
    // removed something unread, so it cannot race an ordinary mark-as-read.
    expect(await badge(U)).toBe(7);
  });

  it('repairs a badge that had drifted, when it prunes something unread', async () => {
    const now = Date.now();
    const old = now - (NOTIFICATION_RETENTION_DAYS + 1) * DAY;
    await put(U, 'sw_drift', old, false);
    // A wildly wrong count, from whatever earlier path.
    await adminDb().doc(`users/${U}`).update({ unreadNotifCount: 99 });

    await runNotificationSweep(now);

    // One unread survivor (sw_recent_unread) — counted, not subtracted from 99.
    expect(await badge(U)).toBe(1);
  });
});
