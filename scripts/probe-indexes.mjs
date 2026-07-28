#!/usr/bin/env node
/**
 * Probe every composite index against PRODUCTION.
 *
 * The emulator does not enforce composite indexes (INHERITED-STACK lesson 6), so
 * a query that passes every local test can still fail the first time a real user
 * runs it. Deploying `firestore.indexes.json` is also not proof: an index can be
 * deployed but still BUILDING, and it errors on use until it finishes.
 *
 * This runs the real query shapes through the Admin SDK. Admin bypasses rules but
 * NOT index requirements, so it exercises exactly the thing that can be missing
 * without needing a signed-in user.
 *
 * A missing or still-building index raises FAILED_PRECONDITION with a link to
 * create it. If you see that, add the definition to firestore.indexes.json too —
 * the console link creates it in the project only, and the repo is the source of
 * truth.
 *
 * Usage (needs gcloud ADC or GOOGLE_APPLICATION_CREDENTIALS):
 *   GCLOUD_PROJECT=sabeel-institute-kanban node scripts/probe-indexes.mjs
 */
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const projectId = process.env.GCLOUD_PROJECT;
if (!projectId) {
  console.error('set GCLOUD_PROJECT=<project-id>');
  process.exit(1);
}

initializeApp({ credential: applicationDefault(), projectId });
const db = getFirestore();

/** A placeholder id is fine: index requirements are validated per query shape. */
const ANY = 'index-probe-placeholder';

// Cards are a TOP-LEVEL collection (`cards/{cardId}` with a `boardId` field), not
// a per-board subcollection — so every card query below is a plain `collection`
// query, and these shapes must stay in step with firestore.indexes.json.
const probes = [
  {
    name: 'board view (boardId + archived + rank)',
    used_by: 'opening a board — useBoardCards',
    run: () =>
      db
        .collection('cards')
        .where('boardId', '==', ANY)
        .where('archived', '==', false)
        .orderBy('rank')
        .limit(1)
        .get(),
  },
  {
    name: 'subtask orphan sweep (parentId ==)',
    used_by:
      'onCardDeleted clearing children of a deleted parent — a single-field ' +
      'auto index, no composite. If this ever fails, deleting a parent silently ' +
      'leaves its subtasks dangling AND unlinkable.',
    run: () => db.collection('cards').where('parentId', '==', ANY).limit(1).get(),
  },
  {
    name: 'my work (assigneeUids array-contains)',
    used_by: 'My work — a single-field auto index, no composite',
    run: () =>
      db
        .collection('cards')
        .where('assigneeUids', 'array-contains', ANY)
        .limit(1)
        .get(),
  },
  {
    name: 'member removal (boardId + assigneeUids)',
    used_by: 'removeBoardMember / countMemberAssignments callables',
    run: () =>
      db
        .collection('cards')
        .where('boardId', '==', ANY)
        .where('assigneeUids', 'array-contains', ANY)
        .limit(1)
        .get(),
  },
  {
    name: 'due soon sweep (archived + dueDate range)',
    used_by: 'dueSoonReminders scheduled job',
    run: () =>
      db
        .collection('cards')
        .where('archived', '==', false)
        .where('dueDate', '>=', '2000-01-01')
        .orderBy('dueDate')
        .limit(1)
        .get(),
  },
  {
    name: 'inbox (read + at desc)',
    used_by: 'Alerts',
    run: () =>
      db
        .collection(`users/${ANY}/notifications`)
        .where('read', '==', false)
        .orderBy('at', 'desc')
        .limit(1)
        .get(),
  },
  {
    name: 'abandoned-upload sweep (collectionGroup attachments + status)',
    used_by: 'the nightly pruneAttachments schedule',
    // A COLLECTION_GROUP query. Automatic single-field indexes are COLLECTION
    // scope ONLY, so this needs an explicit fieldOverride — it was missing on
    // the first deploy and the query returned FAILED_PRECONDITION in production
    // while every emulator test passed.
    run: () =>
      db
        .collectionGroup('attachments')
        .where('status', '==', 'uploading')
        .limit(1)
        .get(),
  },
  {
    name: 'unsubscribe on member removal (boardId + subscriberUids)',
    used_by: 'the removeBoardMember callable',
    // array-contains PLUS an equality, so an automatic single-field index does
    // NOT serve it — it needs the composite beside the assignee one. If this
    // fails, removing someone from a board leaves their subscriptions behind,
    // and the card read rule's subscriber arm keeps their access open.
    run: () =>
      db
        .collection('cards')
        .where('boardId', '==', ANY)
        .where('subscriberUids', 'array-contains', ANY)
        .limit(1)
        .get(),
  },
  {
    name: 'my subscriptions (subscriberUids array-contains)',
    used_by: 'the Subscribed tab in My Work',
    run: () =>
      db.collection('cards').where('subscriberUids', 'array-contains', ANY).limit(1).get(),
  },
  {
    name: 'label usage (labelIds array-contains)',
    used_by: 'the countLabelUsage and deleteLabel callables',
    // A single-field auto index at COLLECTION scope, which cards get for free —
    // unlike the collection-group probe above. Probed anyway because deleting a
    // label depends on it: if this query fails, the sweep cannot find the cards
    // carrying the label and they keep an id pointing at nothing.
    run: () =>
      db.collection('cards').where('labelIds', 'array-contains', ANY).limit(1).get(),
  },
];

let failed = 0;
for (const p of probes) {
  try {
    const snap = await p.run();
    console.log(`  ok    ${p.name}  (${snap.size} docs) — ${p.used_by}`);
  } catch (e) {
    failed++;
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`  FAIL  ${p.name} — ${p.used_by}`);
    console.error(`        ${msg.split('\n')[0]}`);
  }
}

console.log(
  failed === 0
    ? `\n${probes.length}/${probes.length} index probes passed against ${projectId}.`
    : `\n${failed} of ${probes.length} FAILED against ${projectId}.`,
);
process.exit(failed === 0 ? 0 : 1);
