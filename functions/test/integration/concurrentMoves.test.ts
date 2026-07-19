import { describe, it, expect, afterAll, beforeEach } from 'vitest';
import { adminDb, shutdown } from './emulatorClient';
import { compareRank, rankBetween } from '@sabeel/shared';

/**
 * Concurrent card moves — the Phase 3 exit criterion, and the bug shape that
 * burned the sibling project (docs/INHERITED-STACK.md lesson 5).
 *
 * The design claim under test: because a move is ONE write to ONE document,
 * simultaneous moves cannot lose each other. The alternative design — an array
 * of card ids on the board — would make every reorder a write to one hot
 * document, where the last writer silently discards the other's move.
 *
 * Latency is injected BETWEEN each client's read and its write. That is the
 * window where a lost update happens: both clients decide where the card goes
 * based on the same snapshot, then both commit. Without the delay the writes
 * serialise by luck and the test proves nothing.
 */

const BOARD = 'concurrency-board';

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface TestCard {
  id: string;
  rank: string;
  columnId: string;
}

async function readColumn(columnId: string): Promise<TestCard[]> {
  const snap = await adminDb()
    .collection(`boards/${BOARD}/cards`)
    .where('columnId', '==', columnId)
    .get();
  return snap.docs
    .map((d) => ({
      id: d.id,
      rank: d.data().rank as string,
      columnId: d.data().columnId as string,
    }))
    .sort(compareRank);
}

/**
 * One client's move: read the destination, think for `thinkMs`, then write.
 * Mirrors what the app does — moveCard() computes a rank from the neighbours it
 * can see and writes a single document.
 */
async function moveCard(params: {
  cardId: string;
  toColumnId: string;
  index: number;
  thinkMs: number;
}) {
  const target = (await readColumn(params.toColumnId)).filter(
    (c) => c.id !== params.cardId,
  );

  await delay(params.thinkMs);

  const before = params.index > 0 ? target[params.index - 1] : undefined;
  const after = params.index < target.length ? target[params.index] : undefined;

  await adminDb()
    .doc(`boards/${BOARD}/cards/${params.cardId}`)
    .update({
      columnId: params.toColumnId,
      rank: rankBetween(before?.rank ?? null, after?.rank ?? null),
    });
}

beforeEach(async () => {
  const existing = await adminDb().collection(`boards/${BOARD}/cards`).listDocuments();
  await Promise.all(existing.map((d) => d.delete()));

  await adminDb().doc(`boards/${BOARD}`).set({
    name: 'Concurrency',
    description: '',
    archived: false,
    columns: [
      { id: 'todo', name: 'To Do' },
      { id: 'doing', name: 'Doing' },
    ],
    columnIds: ['todo', 'doing'],
    labels: [],
    memberUids: ['a', 'b'],
    createdAt: 1,
    createdBy: 'a',
  });
});

afterAll(async () => {
  await shutdown();
});

async function seed(n: number, columnId = 'todo') {
  let prev: string | null = null;
  for (let i = 0; i < n; i++) {
    prev = rankBetween(prev, null);
    await adminDb().doc(`boards/${BOARD}/cards/card${i}`).set({
      title: `card${i}`,
      description: '',
      columnId,
      rank: prev,
      assigneeUids: [],
      priority: 'none',
      labelIds: [],
      archived: false,
      commentCount: 0,
      createdAt: 1,
      createdBy: 'a',
      updatedAt: 1,
      updatedBy: 'a',
    });
  }
}

describe('two people moving cards at the same time', () => {
  it('both moves survive when they interleave in the same column', async () => {
    await seed(4);

    // Both clients read the same state, both pause, then both write. This is
    // precisely the interleaving that loses an update under array ordering.
    await Promise.all([
      moveCard({ cardId: 'card0', toColumnId: 'todo', index: 3, thinkMs: 250 }),
      moveCard({ cardId: 'card3', toColumnId: 'todo', index: 0, thinkMs: 250 }),
    ]);

    const after = await readColumn('todo');
    expect(after).toHaveLength(4);

    // Neither move was discarded: card3 moved off the end, card0 off the front.
    expect(after[0].id, 'card3 should have moved to the front').toBe('card3');
    expect(after[after.length - 1].id, 'card0 should have moved to the end').toBe(
      'card0',
    );
  });

  it('both moves survive when they target different columns', async () => {
    await seed(4);

    await Promise.all([
      moveCard({ cardId: 'card0', toColumnId: 'doing', index: 0, thinkMs: 300 }),
      moveCard({ cardId: 'card1', toColumnId: 'doing', index: 0, thinkMs: 150 }),
    ]);

    const doing = await readColumn('doing');
    expect(doing.map((c) => c.id).sort()).toEqual(['card0', 'card1']);
    expect(await readColumn('todo')).toHaveLength(2);
  });

  it('ten simultaneous moves all land, and none is lost', async () => {
    await seed(10);

    // Staggered think-times so the writes land in a scrambled order rather than
    // neatly serialised — the harshest arrangement for a lost update.
    await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        moveCard({
          cardId: `card${i}`,
          toColumnId: i % 2 === 0 ? 'doing' : 'todo',
          index: 0,
          thinkMs: 50 + ((i * 37) % 200),
        }),
      ),
    );

    const todo = await readColumn('todo');
    const doing = await readColumn('doing');

    // Every card still exists exactly once, and each landed in the column it was
    // sent to. Losing a move would show up as a card in the wrong column.
    expect(todo.length + doing.length).toBe(10);
    for (let i = 0; i < 10; i++) {
      const target = i % 2 === 0 ? doing : todo;
      expect(
        target.some((c) => c.id === `card${i}`),
        `card${i} should be in ${i % 2 === 0 ? 'doing' : 'todo'}`,
      ).toBe(true);
    }
  });

  it('a rank collision is cosmetic, not corruption', async () => {
    // Two clients can legitimately compute the SAME rank for the same gap when
    // they read identical state. The order must stay total and deterministic —
    // compareRank breaks the tie on id — and no card may vanish.
    await seed(2);
    const [first, second] = await readColumn('todo');

    const tied = rankBetween(first.rank, second.rank);
    await Promise.all([
      adminDb().doc(`boards/${BOARD}/cards/card0`).update({ rank: tied }),
      adminDb().doc(`boards/${BOARD}/cards/card1`).update({ rank: tied }),
    ]);

    const after = await readColumn('todo');
    expect(after).toHaveLength(2);
    expect(new Set(after.map((c) => c.id)).size).toBe(2);
    // Deterministic despite the tie: sorting twice gives the same answer.
    expect(after.map((c) => c.id)).toEqual([...after].sort(compareRank).map((c) => c.id));
  });

  it('a move racing an edit of the same card keeps both effects', async () => {
    // Different fields of one document. Firestore merges field-level updates, so
    // renaming a card while someone moves it must not undo either.
    await seed(2);

    await Promise.all([
      moveCard({ cardId: 'card0', toColumnId: 'doing', index: 0, thinkMs: 200 }),
      (async () => {
        await delay(100);
        await adminDb()
          .doc(`boards/${BOARD}/cards/card0`)
          .update({ title: 'renamed while moving' });
      })(),
    ]);

    const doc = await adminDb().doc(`boards/${BOARD}/cards/card0`).get();
    expect(doc.data()!.columnId).toBe('doing');
    expect(doc.data()!.title).toBe('renamed while moving');
  });
});
