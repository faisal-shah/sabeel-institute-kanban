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

// Cards are a TOP-LEVEL collection now (`cards/{id}`) with a `boardId` field.
const card = (over: Record<string, unknown> = {}) => ({
  boardId: 'b1',
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
    // A second board member1 IS on, for the successful cross-board move.
    await setDoc(doc(db, 'boards/b3'), {
      name: 'Roadmap',
      description: '',
      archived: false,
      columns: [{ id: 'd1', name: 'To Do' }],
      columnIds: ['d1'],
      labels: [],
      memberUids: ['member1'],
      createdAt: 1,
      createdBy: 'manager1',
    });
    await setDoc(doc(db, 'cards/card1'), card());
    // A card on a board member1 is NOT on, but which they are assigned to.
    // Only possible via a data error; the read rule must not widen access
    // beyond that one card.
    await setDoc(
      doc(db, 'cards/foreign'),
      card({ boardId: 'b2', columnId: 'x1', assigneeUids: ['member1'], createdBy: 'outsider' }),
    );
    await setDoc(doc(db, 'cards/foreign2'), card({ boardId: 'b2', columnId: 'x1' }));
    // member2's card on a board member1 cannot see — for the "someone else's
    // assignments" query below.
    await setDoc(
      doc(db, 'cards/m2card'),
      card({ boardId: 'b2', columnId: 'x1', assigneeUids: ['member2'] }),
    );
    // A card carrying a ClickUp `sourceId` — the key-set restriction must not
    // make imported cards uneditable.
    await setDoc(doc(db, 'cards/imported'), card({ sourceId: 'clickup-99' }));
  });
});

describe('reading cards', () => {
  it('a board member reads cards on their board', async () => {
    await assertSucceeds(getDoc(doc(ctx('member1', 'member'), 'cards/card1')));
  });

  it('a manager reads cards on any board', async () => {
    await assertSucceeds(getDoc(doc(ctx('manager1', 'manager'), 'cards/foreign2')));
  });

  it('a non-member cannot read cards on a board they are not on', async () => {
    await assertFails(getDoc(doc(ctx('member1', 'member'), 'cards/foreign2')));
  });

  it('an assignee can read the specific card assigned to them', async () => {
    // The arm that makes the My Work query legal without a parent lookup. It
    // grants exactly one card, not the board.
    await assertSucceeds(getDoc(doc(ctx('member1', 'member'), 'cards/foreign')));
  });

  it('being assigned to one card does not open the rest of that board', async () => {
    await assertFails(getDoc(doc(ctx('member1', 'member'), 'cards/foreign2')));
    await assertFails(getDoc(doc(ctx('member1', 'member'), 'boards/b2')));
  });

  it('a pending user reads nothing', async () => {
    await assertFails(getDoc(doc(ctx('member1', 'member', 'pending'), 'cards/card1')));
  });
});

describe('the My Work query (top-level cards)', () => {
  it('is allowed when constrained to your own assignments', async () => {
    await assertSucceeds(
      getDocs(
        query(
          collection(ctx('member1', 'member'), 'cards'),
          where('assigneeUids', 'array-contains', 'member1'),
        ),
      ),
    );
  });

  it('is refused unconstrained — that would be every card in the org', async () => {
    await assertFails(getDocs(collection(ctx('member1', 'member'), 'cards')));
  });

  it('is refused when asking for someone else assignments', async () => {
    await assertFails(
      getDocs(
        query(
          collection(ctx('member1', 'member'), 'cards'),
          where('assigneeUids', 'array-contains', 'member2'),
        ),
      ),
    );
  });
});

describe('creating cards', () => {
  it('a board member can create one', async () => {
    await assertSucceeds(setDoc(doc(ctx('member1', 'member'), 'cards/new1'), card()));
  });

  it('a non-member of the target board cannot', async () => {
    await assertFails(
      setDoc(
        doc(ctx('member1', 'member'), 'cards/new2'),
        // member1 is not a member of b2.
        card({ boardId: 'b2', columnId: 'x1' }),
      ),
    );
  });

  it('rejects a column that does not exist on the board', async () => {
    await assertFails(
      setDoc(
        doc(ctx('member1', 'member'), 'cards/new3'),
        card({ columnId: 'not-a-column' }),
      ),
    );
  });

  it('rejects a column belonging to a DIFFERENT board', async () => {
    await assertFails(
      setDoc(doc(ctx('member1', 'member'), 'cards/new4'), card({ columnId: 'x1' })),
    );
  });

  it('rejects assigning someone who is not a board member', async () => {
    await assertFails(
      setDoc(
        doc(ctx('member1', 'member'), 'cards/new5'),
        card({ assigneeUids: ['outsider'] }),
      ),
    );
  });

  it('allows assigning an actual board member', async () => {
    await assertSucceeds(
      setDoc(
        doc(ctx('member1', 'member'), 'cards/new6'),
        card({ assigneeUids: ['member2'] }),
      ),
    );
  });

  it('rejects a forged author', async () => {
    await assertFails(
      setDoc(
        doc(ctx('member1', 'member'), 'cards/new7'),
        card({ createdBy: 'manager1', updatedBy: 'manager1' }),
      ),
    );
  });

  it('rejects a forged updatedBy actor', async () => {
    await assertFails(
      setDoc(doc(ctx('member1', 'member'), 'cards/new7b'), card({ updatedBy: 'member2' })),
    );
  });

  it('rejects an empty or over-long title', async () => {
    for (const title of ['', 'x'.repeat(201)]) {
      await assertFails(
        setDoc(doc(ctx('member1', 'member'), 'cards/new8'), card({ title })),
      );
    }
  });

  it('rejects an unknown priority', async () => {
    await assertFails(
      setDoc(
        doc(ctx('member1', 'member'), 'cards/new9'),
        card({ priority: 'catastrophic' }),
      ),
    );
  });

  it('rejects a card born archived', async () => {
    await assertFails(
      setDoc(doc(ctx('member1', 'member'), 'cards/new10'), card({ archived: true })),
    );
  });

  it('rejects an unknown field on the card', async () => {
    // No arbitrary keys: an approved member could otherwise pad a card with a
    // large field that every board viewer then re-downloads.
    await assertFails(
      setDoc(doc(ctx('member1', 'member'), 'cards/new11'), card({ smuggled: 'x' })),
    );
  });

  it('rejects an over-long description', async () => {
    await assertFails(
      setDoc(
        doc(ctx('member1', 'member'), 'cards/new12'),
        card({ description: 'x'.repeat(20001) }),
      ),
    );
  });

  it('allows a card carrying a sourceId (ClickUp import shape)', async () => {
    await assertSucceeds(
      setDoc(
        doc(ctx('member1', 'member'), 'cards/new13'),
        card({ sourceId: 'clickup-123' }),
      ),
    );
  });

  it('allows a card carrying a parentId (a subtask)', async () => {
    // The key-set restriction lists parentId, or every subtask would become
    // uneditable the moment it was linked.
    await assertSucceeds(
      setDoc(
        doc(ctx('member1', 'member'), 'cards/new14'),
        card({ parentId: 'some-other-card' }),
      ),
    );
  });

  it('rejects a non-string parentId', async () => {
    await assertFails(
      setDoc(doc(ctx('member1', 'member'), 'cards/new15'), card({ parentId: 42 })),
    );
  });

  it('rejects an over-long parentId', async () => {
    await assertFails(
      setDoc(
        doc(ctx('member1', 'member'), 'cards/new16'),
        card({ parentId: 'x'.repeat(201) }),
      ),
    );
  });
});

describe('updating cards (in-board)', () => {
  it('a member can move a card between columns on their board', async () => {
    await assertSucceeds(
      updateDoc(doc(ctx('member1', 'member'), 'cards/card1'), {
        ...card(),
        columnId: 'c2',
        rank: 'W',
      }),
    );
  });

  it('a member can archive a card', async () => {
    await assertSucceeds(
      updateDoc(doc(ctx('member1', 'member'), 'cards/card1'), { ...card(), archived: true }),
    );
  });

  it('cannot move a card to a column that does not exist', async () => {
    await assertFails(
      updateDoc(doc(ctx('member1', 'member'), 'cards/card1'), { ...card(), columnId: 'ghost' }),
    );
  });

  it('cannot assign a non-member during an update', async () => {
    await assertFails(
      updateDoc(doc(ctx('member1', 'member'), 'cards/card1'), {
        ...card(),
        assigneeUids: ['outsider'],
      }),
    );
  });

  it('cannot rewrite authorship or creation time', async () => {
    await assertFails(
      updateDoc(doc(ctx('member1', 'member'), 'cards/card1'), {
        ...card(),
        createdBy: 'member1_impostor',
      }),
    );
    await assertFails(
      updateDoc(doc(ctx('member1', 'member'), 'cards/card1'), { ...card(), createdAt: 999 }),
    );
  });

  it('cannot forge the updatedBy actor', async () => {
    await assertFails(
      updateDoc(doc(ctx('member1', 'member'), 'cards/card1'), {
        ...card(),
        updatedBy: 'member2',
      }),
    );
  });

  it('a non-member cannot update', async () => {
    await assertFails(
      updateDoc(doc(ctx('stranger', 'member'), 'cards/card1'), {
        ...card(),
        title: 'Hijacked',
        updatedBy: 'stranger',
      }),
    );
  });

  it('can move a card that carries a sourceId (imported cards stay editable)', async () => {
    // The key-set restriction lists sourceId, or every imported card would become
    // read-only the moment someone tried to move or edit it.
    await assertSucceeds(
      updateDoc(doc(ctx('member1', 'member'), 'cards/imported'), {
        ...card({ sourceId: 'clickup-99' }),
        columnId: 'c2',
        rank: 'W',
      }),
    );
  });

  it('can move a card that carries a parentId (subtasks stay editable)', async () => {
    // Same trap as sourceId: omit parentId from the key list and a card becomes
    // read-only the moment it is made a subtask.
    await assertSucceeds(
      updateDoc(doc(ctx('member1', 'member'), 'cards/card1'), {
        ...card({ parentId: 'parent-card' }),
        columnId: 'c2',
        rank: 'W',
      }),
    );
  });

  it('can UNLINK a subtask by dropping parentId', async () => {
    await assertSucceeds(
      updateDoc(doc(ctx('member1', 'member'), 'cards/card1'), { ...card() }),
    );
  });

  it('rejects adding an unknown field on update', async () => {
    await assertFails(
      updateDoc(doc(ctx('member1', 'member'), 'cards/card1'), { ...card(), smuggled: 'x' }),
    );
  });
});

describe('moving a card to another board', () => {
  it('a plain member moves a card to a board they are also on', async () => {
    // Proves a move is an EDIT, not a delete — the delete gate (manager/admin)
    // must not apply. member1 is on both b1 and b3.
    await assertSucceeds(
      updateDoc(doc(ctx('member1', 'member'), 'cards/card1'), {
        ...card(),
        boardId: 'b3',
        columnId: 'd1',
        labelIds: [],
        assigneeUids: [],
      }),
    );
  });

  it('cannot move a card to a board you are not a member of', async () => {
    await assertFails(
      updateDoc(doc(ctx('member1', 'member'), 'cards/card1'), {
        ...card(),
        boardId: 'b2',
        columnId: 'x1',
      }),
    );
  });

  it('the destination column must exist on the destination board', async () => {
    await assertFails(
      updateDoc(doc(ctx('member1', 'member'), 'cards/card1'), {
        ...card(),
        boardId: 'b3',
        columnId: 'c1', // c1 is a b1 column, not on b3
      }),
    );
  });

  it('cannot keep an assignee who is not a member of the destination', async () => {
    await assertFails(
      updateDoc(doc(ctx('member1', 'member'), 'cards/card1'), {
        ...card(),
        boardId: 'b3',
        columnId: 'd1',
        assigneeUids: ['member2'], // member2 is not on b3
      }),
    );
  });
});

describe('deleting cards', () => {
  it('a plain member CANNOT delete — they archive instead', async () => {
    await assertFails(deleteDoc(doc(ctx('member1', 'member'), 'cards/card1')));
  });

  it('a manager can delete', async () => {
    await assertSucceeds(deleteDoc(doc(ctx('manager1', 'manager'), 'cards/card1')));
  });

  it('an admin can delete', async () => {
    await assertSucceeds(deleteDoc(doc(ctx('admin1', 'admin'), 'cards/card1')));
  });

  it('a disabled manager cannot delete', async () => {
    await assertFails(
      deleteDoc(doc(ctx('manager1', 'manager', 'disabled'), 'cards/card1')),
    );
  });
});

describe('listing cards on a board', () => {
  it('a member can list their board cards', async () => {
    await assertSucceeds(
      getDocs(
        query(
          collection(ctx('member1', 'member'), 'cards'),
          where('boardId', '==', 'b1'),
          where('archived', '==', false),
        ),
      ),
    );
  });

  it('a non-member cannot list another board cards', async () => {
    await assertFails(
      getDocs(
        query(collection(ctx('member1', 'member'), 'cards'), where('boardId', '==', 'b2')),
      ),
    );
  });

  it('a member can list across their boards with a boardId in-query (Search)', async () => {
    // The consolidated Search query. member1 is on both b1 and b3.
    await assertSucceeds(
      getDocs(
        query(
          collection(ctx('member1', 'member'), 'cards'),
          where('boardId', 'in', ['b1', 'b3']),
          where('archived', '==', false),
        ),
      ),
    );
  });

  it('a member cannot in-query a board they are not on', async () => {
    // b2 is not member1's, so the whole in-query must be refused.
    await assertFails(
      getDocs(
        query(
          collection(ctx('member1', 'member'), 'cards'),
          where('boardId', 'in', ['b1', 'b2']),
        ),
      ),
    );
  });
});
