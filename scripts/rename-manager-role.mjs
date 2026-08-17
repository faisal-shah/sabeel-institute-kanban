// Rename the `manager` role to `organizer`, in custom claims and in the mirror.
//
// Step R7b of the board-ownership migration. `manager` used to mean three
// unrelated things — administer any board, curate org labels, see stats — and
// two of them have moved elsewhere. What is left is "may start a board", which
// is what `organizer` names. There is NO compatibility shim: after the R7a rules
// and functions deploy, nothing recognises `manager` at all, so an account still
// holding it can sign in and do nothing but read the boards it belongs to.
//
// RUN IT IMMEDIATELY AFTER R7a — target under two minutes. That gap is the one
// window where `setUserAccess` cannot disable, reject or restore anyone still
// holding `manager` (it sends role and status together, and the role is now
// invalid). This script is an Admin SDK tool, so it can set status directly if
// the gap ever has to be worked through.
//
// THE MANIFEST IS THE ONLY WAY BACK. Custom claims are in no backup — Firebase
// Auth is a separate system from Firestore and neither PITR nor the daily
// exports touch it (docs/DEPLOY.md § Auth is not in any backup). So the manifest
// is written, flushed and re-read BEFORE the first claim changes, and a re-run
// never overwrites it: the first one holds the true pre-migration state, and a
// second pass after a partial run would otherwise record the half-migrated one
// as the thing to restore.
//
// DRY RUN BY DEFAULT. `--apply` writes.
//
//   # emulators
//   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
//     GCLOUD_PROJECT=demo-sabeel-kanban node scripts/rename-manager-role.mjs --apply
//   # production
//   GCLOUD_PROJECT=sabeel-institute-kanban node scripts/rename-manager-role.mjs --apply
//   # and back again
//   GCLOUD_PROJECT=sabeel-institute-kanban node scripts/rename-manager-role.mjs \
//     --revert migration/role-rename-manager-to-organizer.json --apply
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const OLD_ROLE = 'manager';
const NEW_ROLE = 'organizer';
const DEFAULT_MANIFEST = 'migration/role-rename-manager-to-organizer.json';

const APPLY = process.argv.includes('--apply');
const revertIdx = process.argv.indexOf('--revert');
const REVERT = revertIdx >= 0 ? process.argv[revertIdx + 1] : null;
const manifestIdx = process.argv.indexOf('--manifest');
const MANIFEST = manifestIdx >= 0 ? process.argv[manifestIdx + 1] : DEFAULT_MANIFEST;

if (revertIdx >= 0 && !REVERT) {
  console.error('usage: --revert <path to the manifest written by the forward run>');
  process.exit(1);
}

const projectId = process.env.GCLOUD_PROJECT;
if (!projectId) {
  console.error(
    'Refusing to run without GCLOUD_PROJECT. Use demo-sabeel-kanban for the ' +
      'emulators, or the real project id for production.',
  );
  process.exit(1);
}
const usingEmulators = Boolean(process.env.FIREBASE_AUTH_EMULATOR_HOST);
console.log(
  `${REVERT ? `Reverting from ${REVERT}` : `Renaming ${OLD_ROLE} -> ${NEW_ROLE}`} on ` +
    `${projectId}${usingEmulators ? ' (EMULATORS)' : ' (PRODUCTION)'}` +
    `${APPLY ? '' : '  — DRY RUN, nothing will be written'}\n`,
);

initializeApp({ projectId });
const db = getFirestore();
const auth = getAuth();

/** Every Auth account, paged. Eleven-ish people, but pagination is free. */
async function allAuthUsers() {
  const out = [];
  let pageToken;
  do {
    const page = await auth.listUsers(1000, pageToken);
    out.push(...page.users);
    pageToken = page.pageToken;
  } while (pageToken);
  return out;
}

/**
 * Write both halves of one account's access.
 *
 * `setCustomUserClaims` REPLACES the whole claims object — it does not merge —
 * so status has to be written back alongside the role every time. Sending role
 * alone drops status, and `firestore.rules` defaults a missing status to `''`,
 * which denies everything: a silent, total lockout of whoever was migrated.
 *
 * `claimsUpdatedAt` moving is what makes the change land in about a second:
 * `session.ts` watches the mirror and force-refreshes the ID token when it
 * moves. Without it the old claim sits in the client's token for up to an hour.
 */
async function writeAccess(uid, role, status, by) {
  await auth.setCustomUserClaims(uid, { role, status });
  await db.doc(`users/${uid}`).set(
    { role, status, claimsUpdatedAt: FieldValue.serverTimestamp(), accessChangedBy: by },
    { merge: true },
  );
}

if (REVERT) {
  if (!existsSync(REVERT)) {
    console.error(`No such manifest: ${REVERT}`);
    process.exit(1);
  }
  const m = JSON.parse(readFileSync(REVERT, 'utf8'));
  if (m.projectId !== projectId) {
    console.error(
      `ABORT: that manifest was taken from ${m.projectId}, and GCLOUD_PROJECT is ` +
        `${projectId}. Restoring one project's claims onto another is not a thing ` +
        'you can undo.',
    );
    process.exit(1);
  }

  for (const e of m.entries) {
    console.log(
      `  ${e.email || e.uid}  claims ${e.claims.role}/${e.claims.status}` +
        `  doc ${e.doc.role}/${e.doc.status}`,
    );
  }
  if (!APPLY) {
    console.log(
      `\n${m.entries.length} account(s) would be restored to their pre-migration access.` +
        '\nDRY RUN — nothing was written. Re-run with --apply.',
    );
    process.exit(0);
  }

  let restored = 0;
  for (const e of m.entries) {
    // The claims are what the rules read, so they are what must go back exactly.
    // The doc mirror follows them rather than its own recorded value: if the two
    // disagreed before the migration that was already a bug, and `restore-auth`
    // rebuilds claims FROM the mirror, so leaving a disagreement in place would
    // make a later Auth restore reinstate the wrong thing.
    await writeAccess(e.uid, e.claims.role, e.claims.status, 'rename-manager-role-script');
    restored += 1;
    console.log(`  restored ${e.email || e.uid} -> ${e.claims.role}/${e.claims.status}`);
  }
  console.log(`\nRestored ${restored} account(s).`);
  process.exit(0);
}

// ---- forward ----------------------------------------------------------------

const users = await allAuthUsers();
const docs = await db.collection('users').get();
const docById = new Map(docs.docs.map((d) => [d.id, d.data() ?? {}]));

const entries = [];
for (const u of users) {
  const claims = u.customClaims ?? {};
  const doc = docById.get(u.uid) ?? {};
  // Either half being stale is enough to matter: the claims are what the rules
  // trust, and the mirror is what `restore-auth.mjs` would rebuild them from.
  if (claims.role !== OLD_ROLE && doc.role !== OLD_ROLE) continue;
  entries.push({
    uid: u.uid,
    email: u.email ?? '',
    claims: { role: claims.role ?? '', status: claims.status ?? '' },
    doc: { role: doc.role ?? '', status: doc.status ?? '' },
  });
}

/**
 * A doc carrying the old role with no Auth account behind it. `restore-auth.mjs`
 * would rebuild claims from that doc and reinstate a role nothing recognises, so
 * these are repaired too — mirror only, since there is no account to claim.
 */
const docOnly = [];
for (const [uid, d] of docById) {
  if (d.role === OLD_ROLE && !users.some((u) => u.uid === uid)) {
    docOnly.push({ uid, email: d.email ?? '', doc: { role: d.role, status: d.status ?? '' } });
  }
}

if (entries.length === 0 && docOnly.length === 0) {
  console.log(`No account holds ${OLD_ROLE}. Nothing to do.`);
  process.exit(0);
}

for (const e of entries) {
  console.log(
    `  ${e.email || e.uid}  claims ${e.claims.role || '(none)'}/${e.claims.status || '(none)'}` +
      `  doc ${e.doc.role || '(none)'}/${e.doc.status || '(none)'}` +
      `  ->  ${NEW_ROLE}/${e.claims.status || e.doc.status || 'pending'}`,
  );
}
for (const d of docOnly) {
  console.log(`  ${d.email || d.uid}  DOC ONLY (no Auth account)  ->  ${NEW_ROLE} in the mirror`);
}

if (!APPLY) {
  console.log(
    `\n${entries.length} account(s) and ${docOnly.length} orphan mirror(s) would change.` +
      `\nManifest would be written to ${MANIFEST}.` +
      '\nDRY RUN — nothing was written. Re-run with --apply.',
  );
  process.exit(0);
}

// The manifest goes to disk, and is READ BACK, before a single claim moves.
// Claims are in no backup; if this file is not on disk there is no way back.
if (existsSync(MANIFEST)) {
  const prior = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  console.log(
    `Reusing the existing manifest at ${MANIFEST} (${prior.entries.length} entr` +
      `${prior.entries.length === 1 ? 'y' : 'ies'}). It holds the PRE-migration state; ` +
      'overwriting it now would record the half-migrated one instead.\n',
  );
} else {
  mkdirSync(dirname(MANIFEST), { recursive: true });
  writeFileSync(
    MANIFEST,
    `${JSON.stringify(
      {
        projectId,
        direction: `${OLD_ROLE}->${NEW_ROLE}`,
        writtenAt: new Date().toISOString(),
        entries,
        docOnly,
      },
      null,
      2,
    )}\n`,
  );
  const check = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  if (check.entries.length !== entries.length) {
    console.error(`ABORT: ${MANIFEST} did not read back intact. Nothing was changed.`);
    process.exit(1);
  }
  console.log(
    `Manifest written to ${MANIFEST} — ${entries.length} account(s). This file is\n` +
      'the ONLY record of the previous claims. It is gitignored (it carries real\n' +
      'addresses and this repo is public); keep a copy off this machine.\n',
  );
}

let changed = 0;
for (const e of entries) {
  // Status comes from the claims first: they are the live authority, and a
  // mirror that disagrees is the stale copy. Falling back to `pending` rather
  // than `active` keeps the failure direction safe — an admin re-approves.
  const status = e.claims.status || e.doc.status || 'pending';
  await writeAccess(e.uid, NEW_ROLE, status, 'rename-manager-role-script');
  changed += 1;
  console.log(`  ${e.email || e.uid} -> ${NEW_ROLE}/${status}`);
}
for (const d of docOnly) {
  await db
    .doc(`users/${d.uid}`)
    .set(
      { role: NEW_ROLE, accessChangedBy: 'rename-manager-role-script' },
      { merge: true },
    );
  console.log(`  ${d.email || d.uid} -> ${NEW_ROLE} (mirror only)`);
}

console.log(
  `\nRenamed ${changed} account(s) and ${docOnly.length} orphan mirror(s).\n` +
    'Anyone signed in picks it up within about a second. Next: ' +
    'node scripts/verify-board-owners.mjs',
);
process.exit(0);
