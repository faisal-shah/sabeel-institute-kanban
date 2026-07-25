// Rebuild Firebase Auth accounts from the `users/*` Firestore docs.
//
// WHY THIS EXISTS. Firestore backups and PITR cover Firestore only — Firebase
// Auth is a separate system and no backup includes it. That matters here because
// a uid is not cosmetic: `memberUids`, `assigneeUids`, `createdBy`, `authorUid`
// and the notification inbox all reference it. If accounts were recreated by
// letting people simply sign in again, each would get a NEW random uid and every
// one of those references would point at nobody — a database that restores
// "successfully" and is quietly wrong everywhere.
//
// The roster does not need a separate backup, though, because it is already IN
// Firestore: `onUserCreate` provisions `users/{uid}` with displayName, email,
// role and status, and the doc id IS the uid. So a restored Firestore contains
// everything needed to put Auth back — this script is the reader for it.
//
// It restores two things per account:
//   - the account itself, created with its ORIGINAL uid;
//   - the `role` / `status` CUSTOM CLAIMS, because firestore.rules trusts the
//     token, not the user doc. An account restored without claims can sign in
//     and then do nothing at all.
//
// Usage:
//   # DRY RUN (default): reports what it would do, writes NOTHING.
//   GCLOUD_PROJECT=<project-id> node scripts/restore-auth.mjs
//
//   # APPLY:
//   GCLOUD_PROJECT=<project-id> node scripts/restore-auth.mjs --apply
//
//   # Against the emulators:
//   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
//     GCLOUD_PROJECT=demo-sabeel-kanban node scripts/restore-auth.mjs --apply
//
// Writing is OPT-IN and GCLOUD_PROJECT must be explicit, so this can never fall
// back to whatever project ADC happens to point at. It is idempotent and it
// NEVER deletes: an account that already exists keeps its identity, and only its
// claims are re-asserted to match the doc.
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const apply = process.argv.includes('--apply');
const projectId = process.env.GCLOUD_PROJECT;

if (!projectId) {
  console.error(
    'Refusing to run without GCLOUD_PROJECT. Set it explicitly to the project ' +
      'you mean — this script must never guess from ambient credentials.',
  );
  process.exit(1);
}

const usingEmulators = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
console.log(
  `Restoring Auth on ${projectId}${usingEmulators ? ' (EMULATORS)' : ' (PRODUCTION)'} — ` +
    `${apply ? 'APPLY' : 'DRY RUN, nothing will be written'}\n`,
);

initializeApp({ projectId });
const db = getFirestore();
const auth = getAuth();

const snap = await db.collection('users').get();
if (snap.empty) {
  console.error(
    'No `users` documents found. Restore Firestore FIRST — this script rebuilds ' +
      'Auth from those docs, so with none present there is nothing to rebuild.',
  );
  process.exit(1);
}

let created = 0;
let claimsSet = 0;
let alreadyPresent = 0;
let skipped = 0;

for (const doc of snap.docs) {
  const uid = doc.id;
  const d = doc.data();
  const email = typeof d.email === 'string' ? d.email : '';
  const displayName = typeof d.displayName === 'string' ? d.displayName : '';
  // Claims are what the rules actually read. Mirror the defaults the auth
  // trigger uses so a doc missing them cannot silently produce a privileged
  // account: least privilege, and an admin can re-approve from the People screen.
  const role = typeof d.role === 'string' ? d.role : 'member';
  const status = typeof d.status === 'string' ? d.status : 'pending';

  if (!email) {
    console.log(`  SKIP ${uid} — no email on the user doc, cannot create an account`);
    skipped++;
    continue;
  }

  let exists = false;
  try {
    await auth.getUser(uid);
    exists = true;
  } catch (e) {
    if (e?.errorInfo?.code !== 'auth/user-not-found') throw e;
  }

  if (exists) {
    alreadyPresent++;
    console.log(`  present  ${email} (${uid}) — re-asserting claims ${role}/${status}`);
  } else {
    console.log(`  CREATE   ${email} (${uid}) as ${role}/${status}`);
  }

  if (!apply) continue;

  if (!exists) {
    await auth.createUser({
      uid, // the whole point — every Firestore reference depends on it
      email,
      emailVerified: true, // these are Google Workspace accounts on the org domain
      displayName: displayName || undefined,
    });
    created++;
  }
  await auth.setCustomUserClaims(uid, { role, status });
  claimsSet++;
}

console.log(
  `\n${apply ? 'Done' : 'Dry run'}: ${snap.size} user doc(s) — ` +
    `${apply ? `${created} account(s) created, ${claimsSet} claim set(s) written, ` : ''}` +
    `${alreadyPresent} already present, ${skipped} skipped.`,
);
if (apply) {
  console.log(
    '\nEach restored person must sign in again to get a fresh token carrying ' +
      'their claims. If a Google sign-in refuses to attach to a restored ' +
      'account, see the Auth recovery notes in docs/DEPLOY.md.',
  );
} else {
  console.log('\nRe-run with --apply to write.');
}
process.exit(0);
