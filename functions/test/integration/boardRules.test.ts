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
  query,
  where,
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

const baseBoard = (over: Record<string, unknown> = {}) => ({
  name: 'Fundraising',
  description: '',
  archived: false,
  columns: [{ id: 'c1', name: 'To Do' }],
  // Flat mirror of the column ids. Rules cannot search a list of maps, so card
  // writes are validated against this — it must always accompany `columns`.
  columnIds: ['c1'],
  memberUids: ['member1'],
  createdAt: 1,
  createdBy: 'manager1',
  ...over,
});

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
    await setDoc(doc(db, 'boards/b_member'), baseBoard());
    await setDoc(
      doc(db, 'boards/b_other'),
      baseBoard({ name: 'Private Ops', memberUids: ['someone_else'] }),
    );
  });
});

describe('reading a board', () => {
  it('a member reads their own board', async () => {
    await assertSucceeds(getDoc(doc(ctx('member1', 'member'), 'boards/b_member')));
  });

  it('a member CANNOT read a board they are not on', async () => {
    await assertFails(getDoc(doc(ctx('member1', 'member'), 'boards/b_other')));
  });

  it('a manager reads any board without being a member', async () => {
    // Managers may see and join any board — a deliberate consequence of the
    // role model, noted in the brief.
    await assertSucceeds(getDoc(doc(ctx('manager1', 'manager'), 'boards/b_other')));
  });

  it('an admin reads any board', async () => {
    await assertSucceeds(getDoc(doc(ctx('admin1', 'admin'), 'boards/b_other')));
  });

  it('a pending or disabled user reads nothing', async () => {
    for (const status of ['pending', 'rejected', 'disabled']) {
      await assertFails(getDoc(doc(ctx('member1', 'member', status), 'boards/b_member')));
      await assertFails(getDoc(doc(ctx('admin1', 'admin', status), 'boards/b_member')));
    }
  });
});

describe('listing boards', () => {
  it('a member may list ONLY with an array-contains constraint on themselves', async () => {
    const db = ctx('member1', 'member');
    await assertSucceeds(
      getDocs(
        query(collection(db, 'boards'), where('memberUids', 'array-contains', 'member1')),
      ),
    );
  });

  it('a member cannot list all boards', async () => {
    // Without the constraint the query could return boards they may not read,
    // so Firestore must reject it outright.
    await assertFails(getDocs(collection(ctx('member1', 'member'), 'boards')));
  });

  it('a member cannot list boards by claiming to be someone else', async () => {
    await assertFails(
      getDocs(
        query(
          collection(ctx('member1', 'member'), 'boards'),
          where('memberUids', 'array-contains', 'someone_else'),
        ),
      ),
    );
  });

  it('a manager may list every board unconstrained', async () => {
    await assertSucceeds(getDocs(collection(ctx('manager1', 'manager'), 'boards')));
  });
});

describe('creating a board', () => {
  it('a manager can create one', async () => {
    await assertSucceeds(
      setDoc(
        doc(ctx('manager1', 'manager'), 'boards/new1'),
        baseBoard({ createdBy: 'manager1', memberUids: ['manager1'] }),
      ),
    );
  });

  it('a member cannot create one', async () => {
    await assertFails(
      setDoc(
        doc(ctx('member1', 'member'), 'boards/new2'),
        baseBoard({ createdBy: 'member1', memberUids: ['member1'] }),
      ),
    );
  });

  it('the creator must include themselves as a member', async () => {
    // Otherwise the board is born invisible to its own author.
    await assertFails(
      setDoc(
        doc(ctx('manager1', 'manager'), 'boards/new3'),
        baseBoard({ createdBy: 'manager1', memberUids: ['someone_else'] }),
      ),
    );
  });

  it('the creator cannot forge authorship', async () => {
    await assertFails(
      setDoc(
        doc(ctx('manager1', 'manager'), 'boards/new4'),
        baseBoard({ createdBy: 'admin1', memberUids: ['manager1'] }),
      ),
    );
  });

  it('a board cannot be born archived', async () => {
    await assertFails(
      setDoc(
        doc(ctx('manager1', 'manager'), 'boards/new5'),
        baseBoard({ createdBy: 'manager1', memberUids: ['manager1'], archived: true }),
      ),
    );
  });

  it('rejects an empty or over-long name', async () => {
    for (const name of ['', 'x'.repeat(121)]) {
      await assertFails(
        setDoc(
          doc(ctx('manager1', 'manager'), 'boards/new6'),
          baseBoard({ createdBy: 'manager1', memberUids: ['manager1'], name }),
        ),
      );
    }
  });

  it('rejects an unknown field on the board', async () => {
    await assertFails(
      setDoc(
        doc(ctx('manager1', 'manager'), 'boards/new7'),
        baseBoard({ createdBy: 'manager1', memberUids: ['manager1'], smuggled: 'x' }),
      ),
    );
  });
});

describe('updating a board', () => {
  it('a manager can rename it and change columns and membership', async () => {
    const db = ctx('manager1', 'manager');
    await assertSucceeds(
      updateDoc(doc(db, 'boards/b_member'), {
        name: 'Renamed',
        columns: [
          { id: 'c1', name: 'To Do' },
          { id: 'c2', name: 'Doing' },
        ],
        columnIds: ['c1', 'c2'],
        memberUids: ['member1', 'member2'],
        createdBy: 'manager1',
      }),
    );
  });

  // `update` used to validate far less than `create`, which means the shape was
  // only ever guaranteed for a board's FIRST write. Same trap as the comment
  // mentionUids check, which was enforced on new comments and skippable by
  // editing one.
  it('the card count is trigger-owned and cannot be written by a client', async () => {
    // onCardBoardCount maintains it via the Admin SDK, which bypasses rules.
    // A client that could set it would make the Boards list disagree with the
    // board it is describing.
    await assertFails(
      updateDoc(doc(ctx('manager1', 'manager'), 'boards/b_member'), {
        activeCardCount: 999,
      }),
    );
  });

  it('createdAt cannot be rewritten', async () => {
    await assertFails(
      updateDoc(doc(ctx('manager1', 'manager'), 'boards/b_member'), {
        createdAt: 999,
      }),
    );
  });

  it('archived must be a boolean', async () => {
    await assertFails(
      updateDoc(doc(ctx('manager1', 'manager'), 'boards/b_member'), {
        archived: 'yes',
      }),
    );
  });

  it('a MEMBER of the board cannot edit it', async () => {
    // Members use boards; managers run them.
    await assertFails(
      updateDoc(doc(ctx('member1', 'member'), 'boards/b_member'), { name: 'Hijacked' }),
    );
  });

  it('a manager can JOIN a board they are not on by adding their own uid', async () => {
    // The Join button. Adding only your OWN uid needs no directory read, so a
    // manager can step onto any board — the membership half of "managers may
    // join any board" from the brief.
    await assertSucceeds(
      updateDoc(doc(ctx('manager1', 'manager'), 'boards/b_other'), {
        memberUids: ['someone_else', 'manager1'],
        createdBy: 'manager1',
      }),
    );
  });

  it('a member cannot add themselves to a board they are not on', async () => {
    // The escalation path this model has to close.
    await assertFails(
      updateDoc(doc(ctx('member1', 'member'), 'boards/b_other'), {
        memberUids: ['someone_else', 'member1'],
      }),
    );
  });

  it('a member cannot remove themselves either', async () => {
    // Looks like leaving, but would strand their card assignments — that is what
    // the removeBoardMember callable is for.
    await assertFails(
      updateDoc(doc(ctx('member1', 'member'), 'boards/b_member'), { memberUids: [] }),
    );
  });

  it('authorship cannot be rewritten', async () => {
    await assertFails(
      updateDoc(doc(ctx('manager1', 'manager'), 'boards/b_member'), {
        createdBy: 'manager1_impostor',
      }),
    );
  });

  it('archiving is an update, and managers may do it', async () => {
    await assertSucceeds(
      updateDoc(doc(ctx('manager1', 'manager'), 'boards/b_member'), { archived: true }),
    );
  });

  it('an inactive manager cannot update', async () => {
    await assertFails(
      updateDoc(doc(ctx('manager1', 'manager', 'disabled'), 'boards/b_member'), {
        name: 'Nope',
      }),
    );
  });
});

describe('deleting a board', () => {
  it('is impossible for everyone, including admins', async () => {
    // Boards archive, never hard-delete: too much accumulated work to expose a
    // destroy button for.
    await assertFails(deleteDoc(doc(ctx('admin1', 'admin'), 'boards/b_member')));
    await assertFails(deleteDoc(doc(ctx('manager1', 'manager'), 'boards/b_member')));
  });
});
