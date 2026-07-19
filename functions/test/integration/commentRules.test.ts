import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';
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

function ctx(uid: string, role: string, status = 'active') {
  return env
    .authenticatedContext(uid, {
      email: `${uid}@oursabeel.com`,
      email_verified: true,
      role,
      status,
    })
    .firestore();
}

const comment = (over: Record<string, unknown> = {}) => ({
  authorUid: 'member1',
  body: 'looks good to me',
  mentionUids: [],
  createdAt: 1,
  ...over,
});

const CARD = 'boards/b1/cards/card1';

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
    await setDoc(doc(db, 'boards/b1'), {
      name: 'Ops',
      description: '',
      archived: false,
      columns: [{ id: 'c1', name: 'To Do' }],
      columnIds: ['c1'],
      labels: [],
      memberUids: ['member1', 'member2'],
      createdAt: 1,
      createdBy: 'manager1',
    });
    await setDoc(doc(db, CARD), {
      title: 'Fix signup',
      description: '',
      columnId: 'c1',
      rank: 'V',
      assigneeUids: [],
      priority: 'none',
      labelIds: [],
      archived: false,
      commentCount: 0,
      createdAt: 1,
      createdBy: 'member1',
      updatedAt: 1,
      updatedBy: 'member1',
    });
    await setDoc(doc(db, `${CARD}/comments/existing`), comment());
    await setDoc(doc(db, `${CARD}/activity/a1`), {
      type: 'created',
      actorUid: 'member1',
      at: 1,
    });
  });
});

describe('reading comments', () => {
  it('a board member can read the thread', async () => {
    await assertSucceeds(
      getDocs(collection(ctx('member1', 'member'), `${CARD}/comments`)),
    );
  });

  it('a non-member cannot', async () => {
    await assertFails(
      getDocs(collection(ctx('stranger', 'member'), `${CARD}/comments`)),
    );
  });

  it('a manager can, without being a member', async () => {
    await assertSucceeds(
      getDocs(collection(ctx('manager1', 'manager'), `${CARD}/comments`)),
    );
  });
});

describe('writing comments', () => {
  it('a member can comment', async () => {
    await assertSucceeds(
      setDoc(doc(ctx('member1', 'member'), `${CARD}/comments/new1`), comment()),
    );
  });

  it('cannot comment as someone else', async () => {
    // Forged authorship would make the whole thread untrustworthy.
    await assertFails(
      setDoc(
        doc(ctx('member1', 'member'), `${CARD}/comments/new2`),
        comment({ authorUid: 'member2' }),
      ),
    );
  });

  it('rejects an empty or over-long body', async () => {
    for (const body of ['', 'x'.repeat(5001)]) {
      await assertFails(
        setDoc(doc(ctx('member1', 'member'), `${CARD}/comments/new3`), comment({ body })),
      );
    }
  });

  it('rejects mentioning someone who is not on the board', async () => {
    // A mention that notifies someone who cannot open the card is a dead end.
    await assertFails(
      setDoc(
        doc(ctx('member1', 'member'), `${CARD}/comments/new4`),
        comment({ mentionUids: ['outsider'] }),
      ),
    );
  });

  it('allows mentioning a board member', async () => {
    await assertSucceeds(
      setDoc(
        doc(ctx('member1', 'member'), `${CARD}/comments/new5`),
        comment({ mentionUids: ['member2'] }),
      ),
    );
  });

  it('a non-member cannot comment', async () => {
    await assertFails(
      setDoc(
        doc(ctx('stranger', 'member'), `${CARD}/comments/new6`),
        comment({ authorUid: 'stranger' }),
      ),
    );
  });
});

describe('editing comments', () => {
  it('the author can edit their own', async () => {
    await assertSucceeds(
      updateDoc(doc(ctx('member1', 'member'), `${CARD}/comments/existing`), {
        ...comment(),
        body: 'revised',
        editedAt: 2,
      }),
    );
  });

  it('another member cannot edit it', async () => {
    await assertFails(
      updateDoc(doc(ctx('member2', 'member'), `${CARD}/comments/existing`), {
        ...comment(),
        body: 'tampered',
      }),
    );
  });

  it('even a MANAGER cannot rewrite someone else words', async () => {
    // Managers moderate by deleting, never by editing under another name.
    await assertFails(
      updateDoc(doc(ctx('manager1', 'manager'), `${CARD}/comments/existing`), {
        ...comment(),
        body: 'rewritten by a manager',
      }),
    );
  });

  it('authorship cannot be reassigned by an edit', async () => {
    await assertFails(
      updateDoc(doc(ctx('member1', 'member'), `${CARD}/comments/existing`), {
        ...comment(),
        authorUid: 'member2',
      }),
    );
  });
});

describe('deleting comments', () => {
  it('the author can delete their own', async () => {
    await assertSucceeds(
      deleteDoc(doc(ctx('member1', 'member'), `${CARD}/comments/existing`)),
    );
  });

  it('a manager can delete anyone comment — the moderation path', async () => {
    await assertSucceeds(
      deleteDoc(doc(ctx('manager1', 'manager'), `${CARD}/comments/existing`)),
    );
  });

  it('another member cannot', async () => {
    await assertFails(
      deleteDoc(doc(ctx('member2', 'member'), `${CARD}/comments/existing`)),
    );
  });
});

describe('activity is read-only to everyone', () => {
  it('a member can read it', async () => {
    await assertSucceeds(getDoc(doc(ctx('member1', 'member'), `${CARD}/activity/a1`)));
  });

  it('a non-member cannot read it', async () => {
    await assertFails(getDoc(doc(ctx('stranger', 'member'), `${CARD}/activity/a1`)));
  });

  it('NOBODY can write it — not members, not managers, not admins', async () => {
    // The log is trustworthy precisely because it cannot be forged.
    for (const [uid, role] of [
      ['member1', 'member'],
      ['manager1', 'manager'],
      ['admin1', 'admin'],
    ]) {
      await assertFails(
        setDoc(doc(ctx(uid, role), `${CARD}/activity/forged`), {
          type: 'moved',
          actorUid: 'someone-else',
          at: 2,
        }),
      );
      await assertFails(
        updateDoc(doc(ctx(uid, role), `${CARD}/activity/a1`), { actorUid: 'nobody' }),
      );
      await assertFails(deleteDoc(doc(ctx(uid, role), `${CARD}/activity/a1`)));
    }
  });
});
