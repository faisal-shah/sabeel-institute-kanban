/**
 * The board-ownership migration scripts, rehearsed end to end.
 *
 *   . scripts/jdk21.sh && firebase emulators:exec --project demo-sabeel-kanban \
 *     --only firestore,auth "node scripts/migration-e2e.mjs"
 *
 * These four scripts change who can do what, against live production data, and
 * they are run by hand at most a handful of times — so nothing else exercises
 * them. This does: it seeds the awkward cases, drives each script as a real
 * subprocess (exit code included, since three of the gates ARE exit codes), and
 * asserts the round trip in both directions.
 *
 * The awkward cases are the point. A board whose creator has left it, a board
 * that already carries the field, an archived one, an account whose claims and
 * mirror disagree, a user doc with no Auth account behind it, a board with no
 * author at all. Each was chosen because it produces something plausible and
 * wrong if the script does not handle it — most of them silently.
 *
 * Needs firestore + auth ONLY. Deliberately no functions emulator: these scripts
 * write with the Admin SDK, and running triggers would add writes this suite
 * would then have to reason about.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const PROJECT = 'demo-sabeel-kanban';
process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= '127.0.0.1:9099';
process.env.GCLOUD_PROJECT = PROJECT;

const MANIFEST = resolve(import.meta.dirname, '..', 'migration', 'rehearsal-role-rename.json');

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}

/** Run one migration script as a subprocess. Its exit code is part of its contract. */
function run(script, ...args) {
  const r = spawnSync('node', [resolve(import.meta.dirname, script), ...args], {
    env: { ...process.env },
    encoding: 'utf8',
  });
  return { code: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}

initializeApp({ projectId: PROJECT });
const db = getFirestore();
const auth = getAuth();

const A = 'mig_admin';
const M1 = 'mig_mgr1';
const M2 = 'mig_mgr2';
const MEM = 'mig_member';
/** Claims say manager, the mirror says member. The rename must settle both. */
const STALE = 'mig_stale';
/** A user doc with no Auth account — what a half-finished Auth restore leaves. */
const DOC_ONLY = 'mig_doconly';

async function makeUser(uid, role, status, { claims = null, authAccount = true } = {}) {
  if (authAccount) {
    await auth.createUser({ uid, email: `${uid}@oursabeel.com`, emailVerified: true });
    await auth.setCustomUserClaims(uid, claims ?? { role, status });
  }
  await db.doc(`users/${uid}`).set({
    email: `${uid}@oursabeel.com`,
    displayName: uid,
    role,
    status,
    createdAt: 1,
  });
}

function board(overrides) {
  return {
    name: 'Board',
    description: '',
    archived: false,
    columns: [{ id: 'c1', name: 'To Do' }],
    columnIds: ['c1'],
    memberUids: [],
    memberProfiles: {},
    activeCardCount: 0,
    createdAt: 1,
    createdBy: '',
    ...overrides,
  };
}

console.log('Seeding…');
rmSync(MANIFEST, { force: true });

await makeUser(A, 'admin', 'active');
await makeUser(M1, 'manager', 'active');
await makeUser(M2, 'manager', 'active');
await makeUser(MEM, 'member', 'active');
await makeUser(STALE, 'member', 'active', { claims: { role: 'manager', status: 'active' } });
await makeUser(DOC_ONLY, 'manager', 'active', { authAccount: false });

const B_NORMAL = 'mig_b_normal';
const B_LEFT = 'mig_b_left';
const B_MANY = 'mig_b_many';
const B_ARCHIVED = 'mig_b_archived';
const B_DONE = 'mig_b_done';

await db.doc(`boards/${B_NORMAL}`).set(
  board({ name: 'Normal', createdBy: M1, memberUids: [M1, MEM] }),
);
// The creator was removed from their own board. Naming them owner would be a
// false record — `ownsBoard` needs membership too, so it would grant nothing.
await db.doc(`boards/${B_LEFT}`).set(
  board({ name: 'Creator left', createdBy: M2, memberUids: [MEM] }),
);
await db.doc(`boards/${B_MANY}`).set(
  board({ name: 'Several members', createdBy: A, memberUids: [A, M1, MEM] }),
);
await db.doc(`boards/${B_ARCHIVED}`).set(
  board({ name: 'Archived', createdBy: M1, memberUids: [M1], archived: true }),
);
// Already migrated — a partial run, or a re-run. Must be left exactly as-is.
await db.doc(`boards/${B_DONE}`).set(
  board({ name: 'Already done', createdBy: M1, memberUids: [M1, MEM], boardOwnerUids: [MEM] }),
);

const owners = async (id) => (await db.doc(`boards/${id}`).get()).data()?.boardOwnerUids;
const roleOf = async (uid) => {
  const claims = (await auth.getUser(uid).catch(() => null))?.customClaims ?? {};
  const doc = (await db.doc(`users/${uid}`).get()).data() ?? {};
  return { claims: `${claims.role ?? '-'}/${claims.status ?? '-'}`, doc: `${doc.role ?? '-'}/${doc.status ?? '-'}` };
};

// ---- backfill: the gates ----------------------------------------------------
console.log('\nbackfill-board-owners — gates');

{
  const r = run('backfill-board-owners.mjs');
  check('dry run reports every board and writes nothing', r.code === 0 && (await owners(B_NORMAL)) === undefined);
  check('dry run says so out loud', r.out.includes('DRY RUN'));
  check(
    'dry run names the board whose creator left',
    r.out.includes(B_LEFT) && r.out.includes('NO OWNER'),
    r.out.includes('NO OWNER') ? '' : r.out.slice(-400),
  );
}

{
  const r = spawnSync('node', [resolve(import.meta.dirname, 'backfill-board-owners.mjs')], {
    env: { ...process.env, GCLOUD_PROJECT: '' },
    encoding: 'utf8',
  });
  check('refuses to run without GCLOUD_PROJECT', r.status === 1);
}

{
  // GATE 1 — no author. Writing `['']` would mint an owner no uid can ever match.
  await db.doc('boards/mig_b_authorless').set(board({ name: 'No author', memberUids: [MEM] }));
  const r = run('backfill-board-owners.mjs', '--apply');
  check('ABORTS on a board with no createdBy', r.code === 1 && r.out.includes('ABORT'));
  check('names the offending board', r.out.includes('mig_b_authorless'));
  check('and wrote nothing first', (await owners(B_NORMAL)) === undefined);
  await db.doc('boards/mig_b_authorless').delete();
}

{
  // GATE 3 — an owner who could not administer a board under the OLD rules. This
  // is what makes shipping the client before the rules flip safe: everyone the
  // new client offers buttons to is someone the old rule still allows.
  await db.doc('boards/mig_b_lowrole').set(
    board({ name: 'Member-created', createdBy: MEM, memberUids: [MEM] }),
  );
  const r = run('backfill-board-owners.mjs', '--apply');
  check('ABORTS when an owner-to-be is only a member', r.code === 1 && r.out.includes(MEM));
  check('and still wrote nothing', (await owners(B_NORMAL)) === undefined);
  await db.doc('boards/mig_b_lowrole').delete();
}

// ---- backfill: the canary and the run ---------------------------------------
console.log('\nbackfill-board-owners — apply');

{
  const r = run('backfill-board-owners.mjs', '--only', B_NORMAL, '--apply');
  const one = await owners(B_NORMAL);
  check('--only writes exactly the named board', r.code === 0 && JSON.stringify(one) === JSON.stringify([M1]));
  check('--only leaves the others alone', (await owners(B_MANY)) === undefined);
}

{
  const r = run('backfill-board-owners.mjs', '--apply');
  check('exits clean', r.code === 0, r.code === 0 ? '' : r.out.slice(-500));
  check('the creator becomes the owner', JSON.stringify(await owners(B_MANY)) === JSON.stringify([A]));
  check('an archived board is migrated too', JSON.stringify(await owners(B_ARCHIVED)) === JSON.stringify([M1]));
  check(
    'a board whose creator left gets an HONEST empty list',
    JSON.stringify(await owners(B_LEFT)) === JSON.stringify([]),
  );
  check(
    'an already-migrated board is untouched',
    JSON.stringify(await owners(B_DONE)) === JSON.stringify([MEM]),
  );
  check('and it says which boards need a hand', r.out.includes('assign by hand'));
}

{
  const before = JSON.stringify(await owners(B_NORMAL));
  const r = run('backfill-board-owners.mjs', '--apply');
  check(
    'is idempotent — a second run changes nothing',
    r.code === 0 && JSON.stringify(await owners(B_NORMAL)) === before,
  );
  check('and reports them as already done', /already had owners/.test(r.out));
}

// ---- verify: it must FAIL before the rename ---------------------------------
console.log('\nverify-board-owners — before the rename');

{
  const r = run('verify-board-owners.mjs');
  // A verifier that cannot fail proves nothing, so this is asserted first, on a
  // state that is genuinely not finished: the claims still say `manager`.
  check('fails while any account still holds the retired role', r.code === 1);
  check('says which accounts', r.out.includes(`${M1}@oursabeel.com`));
  check('warns about the ownerless board without failing on it', r.out.includes('NO owner'));
  check('counts the boards when asked', run('verify-board-owners.mjs', '--expect-boards', '5').out.includes('matching the manifest'));
  check('fails on a board count that moved', run('verify-board-owners.mjs', '--expect-boards', '4').code === 1);
}

{
  // A stray owner is inert — `ownsBoard` needs membership too — but it is a lie
  // on screen, and it is exactly what a `removeBoardMember` that forgot its
  // arrayRemove would leave behind.
  await db.doc(`boards/${B_MANY}`).update({ boardOwnerUids: FieldValue.arrayUnion('mig_ghost') });
  const r = run('verify-board-owners.mjs');
  check('fails on an owner who is not a member', r.code === 1 && r.out.includes('mig_ghost'));
  await db.doc(`boards/${B_MANY}`).update({ boardOwnerUids: FieldValue.arrayRemove('mig_ghost') });
}

{
  await db.doc(`boards/${B_NORMAL}`).update({ boardOwnerUids: FieldValue.delete() });
  const r = run('verify-board-owners.mjs');
  check('fails on a board the backfill missed', r.code === 1 && r.out.includes('did not finish'));
  await db.doc(`boards/${B_NORMAL}`).update({ boardOwnerUids: [M1] });
}

// ---- rename ------------------------------------------------------------------
console.log('\nrename-manager-role');

{
  const r = run('rename-manager-role.mjs', '--manifest', MANIFEST);
  check('dry run writes nothing', r.code === 0 && (await roleOf(M1)).claims === 'manager/active');
  check('dry run writes no manifest either', !existsSync(MANIFEST));
  check('finds the account whose claims and mirror disagree', r.out.includes(STALE));
  check('finds the user doc with no Auth account', r.out.includes('DOC ONLY'));
}

{
  const r = run('rename-manager-role.mjs', '--manifest', MANIFEST, '--apply');
  check('exits clean', r.code === 0, r.code === 0 ? '' : r.out.slice(-500));
  check('a manager becomes an organizer in the claims', (await roleOf(M1)).claims === 'organizer/active');
  check('and in the mirror', (await roleOf(M1)).doc === 'organizer/active');
  check('an admin is untouched', (await roleOf(A)).claims === 'admin/active');
  check('a member is untouched', (await roleOf(MEM)).claims === 'member/active');

  const stale = await roleOf(STALE);
  check('a stale mirror is repaired to match the claims', stale.claims === 'organizer/active' && stale.doc === 'organizer/active', `${stale.claims} / ${stale.doc}`);

  const orphan = (await db.doc(`users/${DOC_ONLY}`).get()).data();
  check('an orphan mirror is renamed too', orphan?.role === 'organizer');

  check('the change is stamped so signed-in clients refresh', Boolean((await db.doc(`users/${M1}`).get()).data()?.claimsUpdatedAt));
  check('and attributed', (await db.doc(`users/${M1}`).get()).data()?.accessChangedBy === 'rename-manager-role-script');
}

{
  const m = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  check('the manifest exists and names this project', m.projectId === PROJECT);
  check('it records the PRE-migration claims', m.entries.every((e) => e.claims.role === 'manager'));
  check('including the disagreeing mirror', m.entries.find((e) => e.uid === STALE)?.doc.role === 'member');
  check('and the orphan', m.docOnly.some((d) => d.uid === DOC_ONLY));
}

{
  // The manifest is the ONLY way back — claims are in no backup — so a second
  // run must not replace the pre-migration record with the migrated one.
  const before = readFileSync(MANIFEST, 'utf8');
  const r = run('rename-manager-role.mjs', '--manifest', MANIFEST, '--apply');
  check('a re-run finds nothing left to do', r.code === 0 && r.out.includes('Nothing to do'));
  check('and does not overwrite the manifest', readFileSync(MANIFEST, 'utf8') === before);
}

// ---- verify: now it must PASS ------------------------------------------------
console.log('\nverify-board-owners — after the rename');

{
  const r = run('verify-board-owners.mjs', '--expect-boards', '5');
  check('passes', r.code === 0, r.code === 0 ? '' : r.out.slice(-800));
  check('still warns about the ownerless board', r.out.includes('NO owner'));
  check('claims and mirror agree everywhere', r.out.includes('claims and mirror agree'));
}

// ---- both inverses -----------------------------------------------------------
console.log('\nthe undo paths');

{
  const r = run('rename-manager-role.mjs', '--revert', MANIFEST, '--apply');
  check('revert exits clean', r.code === 0, r.code === 0 ? '' : r.out.slice(-500));
  check('claims go back exactly', (await roleOf(M1)).claims === 'manager/active');
  check('and the mirror follows the claims, not its own old value', (await roleOf(STALE)).doc === 'manager/active');
  check('verify notices immediately', run('verify-board-owners.mjs').code === 1);
}

{
  const r = spawnSync('node', [resolve(import.meta.dirname, 'rename-manager-role.mjs'), '--revert', MANIFEST, '--apply'], {
    env: { ...process.env, GCLOUD_PROJECT: 'some-other-project' },
    encoding: 'utf8',
  });
  check(
    'revert refuses a manifest from another project',
    r.status === 1 && `${r.stdout}${r.stderr}`.includes('ABORT'),
  );
}

{
  // Forward again, so the rest of the run is on the migrated state.
  run('rename-manager-role.mjs', '--manifest', MANIFEST, '--apply');
  check('and forward again lands', (await roleOf(M1)).claims === 'organizer/active');
}

{
  const dry = run('unbackfill-board-owners.mjs');
  check('unbackfill dry run writes nothing', dry.code === 0 && (await owners(B_NORMAL)) !== undefined);

  const r = run('unbackfill-board-owners.mjs', '--apply');
  check('unbackfill exits clean', r.code === 0, r.code === 0 ? '' : r.out.slice(-500));
  const gone = await Promise.all(
    [B_NORMAL, B_LEFT, B_MANY, B_ARCHIVED, B_DONE].map((id) => owners(id)),
  );
  // This is the only undo the backfill has: a Firestore import merges by
  // document id, so it restores what was DELETED and cannot remove what was
  // wrongly ADDED. A field addition is outside the backup's reach entirely.
  check('the field is gone from every board', gone.every((o) => o === undefined));
  check('the boards themselves survive', (await db.collection('boards').get()).size === 5);
  check('and their members are untouched', (await db.doc(`boards/${B_MANY}`).get()).data()?.memberUids?.length === 3);
}

{
  const r = run('backfill-board-owners.mjs', '--apply');
  check('the round trip completes — backfill works again after an undo', r.code === 0 && JSON.stringify(await owners(B_MANY)) === JSON.stringify([A]));
}

// ---- restore-auth, across the migration --------------------------------------
console.log('\nrestore-auth, on a mirror from before the migration');

{
  // What a restore from a pre-migration backup looks like: the user doc carries
  // a role nothing matches any more. Restoring it verbatim would produce an
  // account that signs in and can do nothing, with no error saying why.
  await db.doc(`users/${M1}`).set({ role: 'manager' }, { merge: true });
  const r = run('restore-auth.mjs', '--apply');
  check('exits clean', r.code === 0, r.code === 0 ? '' : r.out.slice(-500));
  const after = await roleOf(M1);
  check('a retired role is not reinstated', !after.claims.startsWith('manager'), after.claims);
  // Narrowed to the least-privilege role — but `active` survives, because the
  // two fields are independent and an unrecognised role says nothing about
  // whether the account was approved.
  check('it lands on the least-privilege role', after.claims === 'member/active', after.claims);
  check('and says so', r.out.includes('no rule matches'));
  check('the mirror is narrowed too, so the next restore has nothing to repair', after.doc === 'member/active');
  check('an admin is restored as an admin', (await roleOf(A)).claims === 'admin/active');

  // Put it back for the summary below.
  await auth.setCustomUserClaims(M1, { role: 'organizer', status: 'active' });
  await db.doc(`users/${M1}`).set({ role: 'organizer', status: 'active' }, { merge: true });
}

// ---- done --------------------------------------------------------------------
rmSync(MANIFEST, { force: true });

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
if (failed.length > 0) {
  console.log('\nFailed:');
  for (const f of failed) console.log(`  - ${f.name}`);
  process.exit(1);
}
process.exit(0);
