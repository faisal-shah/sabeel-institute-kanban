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
  collectionGroup,
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

const card = (over: Record<string, unknown> = {}) => ({
  title: 'Fix signup flow',
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
    await setDoc(doc(db, 'boards/b1'), {
      name: 'Ops',
      description: '',
      archived: false,
      columns: [
        { id: 'c1', name: 'To Do' },
        { id: 'c2', name: 'Done' },
      ],
      columnIds: ['c1', 'c2'],
      labels: [],
      memberUids: ['member1', 'member2'],
      createdAt: 1,
      createdBy: 'manager1',
    });
    await setDoc(doc(db, 'boards/b2'), {
      name: 'Private',
      description: '',
      archived: false,
      columns: [{ id: 'x1', name: 'To Do' }],
      columnIds: ['x1'],
      labels: [],
      memberUids: ['outsider'],
      createdAt: 1,
      createdBy: 'manager1',
    });
    await setDoc(doc(db, 'boards/b1/cards/card1'), card());
    // A card on a board `member1` is NOT on, but which they are assigned to.
    // Only possible via a data error, and the read rule must not widen access
    // beyond that one card.
    await setDoc(
      doc(db, 'boards/b2/cards/foreign'),
      card({ columnId: 'x1', assigneeUids: ['member1'], createdBy: 'outsider' }),
    );
    await setDoc(doc(db, 'boards/b2/cards/foreign2'), card({ columnId: 'x1' }));
  });
});

describe('reading cards', () => {
  it('a board member reads cards on their board', async () => {
    await assertSucceeds(getDoc(doc(ctx('member1', 'member'), 'boards/b1/cards/card1')));
  });

  it('a manager reads cards on any board', async () => {
    await assertSucceeds(getDoc(doc(ctx('manager1', 'manager'), 'boards/b2/cards/foreign2')));
  });

  it('a non-member cannot read cards on a board they are not on', async () => {
    await assertFails(getDoc(doc(ctx('member1', 'member'), 'boards/b2/cards/foreign2')));
  });

  it('an assignee can read the specific card assigned to them', async () => {
    // The arm that makes the cross-board My Work query legal without a parent
    // lookup. It grants exactly one card, not the board.
    await assertSucceeds(getDoc(doc(ctx('member1', 'member'), 'boards/b2/cards/foreign')));
  });

  it('being assigned to one card does not open the rest of that board', async () => {
    await assertFails(getDoc(doc(ctx('member1', 'member'), 'boards/b2/cards/foreign2')));
    await assertFails(getDoc(doc(ctx('member1', 'member'), 'boards/b2')));
  });

  it('a pending user reads nothing', async () => {
    await assertFails(
      getDoc(doc(ctx('member1', 'member', 'pending'), 'boards/b1/cards/card1')),
    );
  });
});

describe('the My Work collection-group query', () => {
  it('is allowed when constrained to your own assignments', async () => {
    await assertSucceeds(
      getDocs(
        query(
          collectionGroup(ctx('member1', 'member'), 'cards'),
          where('assigneeUids', 'array-contains', 'member1'),
        ),
      ),
    );
  });

  it('is refused unconstrained — that would be every card in the org', async () => {
    await assertFails(getDocs(collectionGroup(ctx('member1', 'member'), 'cards')));
  });

  it('is refused when asking for someone else assignments', async () => {
    await assertFails(
      getDocs(
        query(
          collectionGroup(ctx('member1', 'member'), 'cards'),
          where('assigneeUids', 'array-contains', 'member2'),
        ),
      ),
    );
  });
});

describe('creating cards', () => {
  it('a board member can create one', async () => {
    await assertSucceeds(
      setDoc(doc(ctx('member1', 'member'), 'boards/b1/cards/new1'), card()),
    );
  });

  it('a non-member cannot', async () => {
    await assertFails(
      setDoc(
        doc(ctx('stranger', 'member'), 'boards/b1/cards/new2'),
        card({ createdBy: 'stranger' }),
      ),
    );
  });

  it('rejects a column that does not exist on the board', async () => {
    // Clients cannot invent columns — this is what `columnIds` exists for.
    await assertFails(
      setDoc(
        doc(ctx('member1', 'member'), 'boards/b1/cards/new3'),
        card({ columnId: 'not-a-column' }),
      ),
    );
  });

  it('rejects a column belonging to a DIFFERENT board', async () => {
    await assertFails(
      setDoc(
        doc(ctx('member1', 'member'), 'boards/b1/cards/new4'),
        card({ columnId: 'x1' }),
      ),
    );
  });

  it('rejects assigning someone who is not a board member', async () => {
    // Load-bearing: assignment implies membership, which is what keeps the
    // assignee read-rule from leaking access.
    await assertFails(
      setDoc(
        doc(ctx('member1', 'member'), 'boards/b1/cards/new5'),
        card({ assigneeUids: ['outsider'] }),
      ),
    );
  });

  it('allows assigning an actual board member', async () => {
    await assertSucceeds(
      setDoc(
        doc(ctx('member1', 'member'), 'boards/b1/cards/new6'),
        card({ assigneeUids: ['member2'] }),
      ),
    );
  });

  it('rejects a forged author', async () => {
    await assertFails(
      setDoc(
        doc(ctx('member1', 'member'), 'boards/b1/cards/new7'),
        card({ createdBy: 'manager1' }),
      ),
    );
  });

  it('rejects an empty or over-long title', async () => {
    for (const title of ['', 'x'.repeat(201)]) {
      await assertFails(
        setDoc(doc(ctx('member1', 'member'), 'boards/b1/cards/new8'), card({ title })),
      );
    }
  });

  it('rejects an unknown priority', async () => {
    await assertFails(
      setDoc(
        doc(ctx('member1', 'member'), 'boards/b1/cards/new9'),
        card({ priority: 'catastrophic' }),
      ),
    );
  });

  it('rejects a card born archived', async () => {
    await assertFails(
      setDoc(
        doc(ctx('member1', 'member'), 'boards/b1/cards/new10'),
        card({ archived: true }),
      ),
    );
  });
});

describe('updating cards', () => {
  it('a member can move a card between columns on their board', async () => {
    await assertSucceeds(
      updateDoc(doc(ctx('member1', 'member'), 'boards/b1/cards/card1'), {
        ...card(),
        columnId: 'c2',
        rank: 'W',
      }),
    );
  });

  it('a member can archive a card', async () => {
    await assertSucceeds(
      updateDoc(doc(ctx('member1', 'member'), 'boards/b1/cards/card1'), {
        ...card(),
        archived: true,
      }),
    );
  });

  it('cannot move a card to a column that does not exist', async () => {
    await assertFails(
      updateDoc(doc(ctx('member1', 'member'), 'boards/b1/cards/card1'), {
        ...card(),
        columnId: 'ghost',
      }),
    );
  });

  it('cannot assign a non-member during an update', async () => {
    await assertFails(
      updateDoc(doc(ctx('member1', 'member'), 'boards/b1/cards/card1'), {
        ...card(),
        assigneeUids: ['outsider'],
      }),
    );
  });

  it('cannot rewrite authorship or creation time', async () => {
    await assertFails(
      updateDoc(doc(ctx('member1', 'member'), 'boards/b1/cards/card1'), {
        ...card(),
        createdBy: 'member1_impostor',
      }),
    );
    await assertFails(
      updateDoc(doc(ctx('member1', 'member'), 'boards/b1/cards/card1'), {
        ...card(),
        createdAt: 999,
      }),
    );
  });

  it('a non-member cannot update', async () => {
    await assertFails(
      updateDoc(doc(ctx('stranger', 'member'), 'boards/b1/cards/card1'), {
        ...card(),
        title: 'Hijacked',
      }),
    );
  });
});

describe('deleting cards', () => {
  it('a plain member CANNOT delete — they archive instead', async () => {
    await assertFails(deleteDoc(doc(ctx('member1', 'member'), 'boards/b1/cards/card1')));
  });

  it('a manager can delete', async () => {
    await assertSucceeds(
      deleteDoc(doc(ctx('manager1', 'manager'), 'boards/b1/cards/card1')),
    );
  });

  it('an admin can delete', async () => {
    await assertSucceeds(deleteDoc(doc(ctx('admin1', 'admin'), 'boards/b1/cards/card1')));
  });

  it('a disabled manager cannot delete', async () => {
    await assertFails(
      deleteDoc(doc(ctx('manager1', 'manager', 'disabled'), 'boards/b1/cards/card1')),
    );
  });
});

describe('listing cards on a board', () => {
  it('a member can list their board cards', async () => {
    await assertSucceeds(
      getDocs(
        query(
          collection(ctx('member1', 'member'), 'boards/b1/cards'),
          where('archived', '==', false),
        ),
      ),
    );
  });

  it('a non-member cannot list another board cards', async () => {
    await assertFails(
      getDocs(collection(ctx('member1', 'member'), 'boards/b2/cards')),
    );
  });
});
