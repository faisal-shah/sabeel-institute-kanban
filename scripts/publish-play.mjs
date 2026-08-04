/**
 * Upload the release AAB to Google Play, without a browser.
 *
 *   node scripts/publish-play.mjs --check       # gates + auth only, uploads nothing
 *   node scripts/publish-play.mjs --share       # internal app sharing (default)
 *   node scripts/publish-play.mjs --internal    # the internal TESTING track
 *
 * TWO DESTINATIONS, DELIBERATELY DIFFERENT IN WEIGHT:
 *
 *  --share  Internal app sharing. Returns a download link and touches nothing
 *           else: the Sabeel testers on the internal track do not receive it and
 *           are not notified. This is the "put a build on my phone while I am
 *           away from the computer" case, and it is the default because it is
 *           the one that cannot disturb anyone.
 *
 *  --internal  The internal testing track. This IS a release to the team, so it
 *           carries the same gates `build-aab.sh` does and asks before doing it.
 *
 * Internal app sharing needs no edit/commit cycle; the testing track does —
 * insert an edit, upload, point the track at the new versionCode, commit.
 *
 * CREDENTIALS LIVE OUTSIDE THE REPO, like the keystore. This repo is public: a
 * service-account key committed here would be a publish credential for the app,
 * readable by anyone, forever, whatever a later commit removes.
 *
 * The service account needs Play Console's "Release apps to testing tracks"
 * permission, which covers internal app sharing too.
 */
import { createRequire } from 'node:module';
import { readFile, stat } from 'node:fs/promises';
import { readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';

const require = createRequire(import.meta.url);
const { GoogleAuth } = require('google-auth-library');

const ROOT = resolve(import.meta.dirname, '..');
const AAB = resolve(ROOT, 'app/android/app/build/outputs/bundle/release/app-release.aab');
// Named for the DEVELOPER ACCOUNT (sabeel), not for this app: one service
// account publishes every app on the account, scoped per-app by Play Console
// permissions, so a second app needs a tick box rather than a new credential.
// Every sibling repo defaults to this same path with no configuration.
// (The upload KEYSTORE is the opposite — one per app — hence
// `sabeel-kanban-upload.jks` beside it.)
const KEY = process.env.SK_PLAY_KEY ?? join(homedir(), 'keys', 'sabeel-play-publisher.json');
const API = 'https://androidpublisher.googleapis.com';

const args = process.argv.slice(2);
const check = args.includes('--check');
const toTrack = args.includes('--internal');
const app = JSON.parse(await readFile(resolve(ROOT, 'app/app.json'), 'utf8')).expo;
const pkg = app.android.package;
const version = app.version;

const die = (m) => {
  console.error(`\n${m}\n`);
  process.exit(1);
};

if (args.includes('--help') || args.length === 0) {
  console.log(`
  --check      run every gate and prove the Play permission; upload nothing
  --share      internal app sharing: a link, and nobody is notified (safe)
  --internal   the internal TESTING track: the team gets this (a release)
`);
  process.exit(args.length === 0 ? 1 : 0);
}
// The two destinations differ in who sees the build, so a command that names
// both is a typo, not a preference — and guessing would publish to the team.
if (toTrack && args.includes('--share')) {
  die('--share and --internal are different audiences. Pass one.');
}

// ---- gates, before anything leaves this machine ----------------------------

// Same two `build-aab.sh` holds, repeated here because a bundle built last week
// can be published today: the version must be store-legal, and the deploy log
// must already describe this release (it becomes the release notes).
execFileSync('node', [resolve(ROOT, 'scripts/check-version.mjs')], { stdio: 'inherit' });
try {
  execFileSync('node', [resolve(ROOT, 'scripts/deploy-notes.mjs'), version, '--title'], {
    stdio: 'pipe',
  });
} catch {
  die(`docs/PHASE_STATUS.md has no deploy-log entry for ${version} — write it before publishing.`);
}

const aab = await stat(AAB).catch(() => null);
// In --check the artifact is ADVISORY: the point of --check is to prove the
// credentials and permissions work, which must be answerable before a bundle
// has ever been built. Refusing here made it useless for exactly that.
if (!aab && !check) die(`No bundle at ${AAB}\nRun: npm run build:aab`);

/**
 * REFUSE A BUNDLE THAT IS NOT THIS VERSION — by reading what is INSIDE it.
 *
 * The first version of this gate compared mtimes, and it was defeated the first
 * time it was tested: copying the file back after an experiment refreshed its
 * timestamp, and a bundle whose contents said 0.7.4 then passed as 0.7.5. A
 * timestamp describes the file, not the build.
 *
 * The versionName survives in the base manifest as a plain string, so the
 * bundle can be asked what it actually is. mtime stays as a secondary hint,
 * because a bundle older than the source is worth mentioning even when the
 * version happens to match.
 */
function bundleVersion() {
  try {
    const manifest = execFileSync('unzip', ['-p', AAB, 'base/manifest/AndroidManifest.xml'], {
      maxBuffer: 32 * 1024 * 1024,
    });
    // Binary protobuf; the versionName is stored as a readable string in it.
    const found = [...manifest.toString('latin1').matchAll(/\d+\.\d+\.\d+/g)].map((m) => m[0]);
    return [...new Set(found)];
  } catch {
    return [];
  }
}

async function newestSource(dir, newest = 0) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === 'build' || e.name.startsWith('.')) continue;
    const p = join(dir, e.name);
    newest = e.isDirectory()
      ? await newestSource(p, newest)
      : Math.max(newest, (await stat(p)).mtimeMs);
  }
  return newest;
}
let staleNote = false;
const srcNewest = Math.max(
  await newestSource(resolve(ROOT, 'app/src')),
  await newestSource(resolve(ROOT, 'packages/shared/src')),
  // Native config decides what the bundle IS — minSdk, signing, the version
  // code. `newestSource` skips any `build` directory, so the bundle's own
  // output folder cannot make this always-stale.
  await newestSource(resolve(ROOT, 'app/android')),
);
if (aab) {
  const inside = bundleVersion();
  if (!inside.length) {
    die(`Could not read a version out of ${AAB}.\nRebuild: npm run build:aab`);
  }
  if (!inside.includes(version)) {
    die(
      `That bundle is NOT ${version}.\n` +
        `  app.json says: ${version}\n` +
        `  bundle carries: ${inside.join(', ')}\n` +
        `Rebuild: npm run build:aab`,
    );
  }
  console.log(`bundle carries version ${version} (read from the manifest)`);
}

if (aab && srcNewest > aab.mtimeMs) {
  const stale =
    `The bundle is OLDER than the source.\n` +
    `  bundle: ${new Date(aab.mtimeMs).toISOString()}\n` +
    `  source: ${new Date(srcNewest).toISOString()}\n` +
    `Rebuild with: npm run build:aab`;
  if (!check) die(stale);
  staleNote = true;
  console.log(`\nNOTE — would refuse to upload:\n${stale}`);
}

/*
 * REFUSE A DEBUG-SIGNED BUNDLE, independently of how it was built.
 *
 * `build-aab.sh` checks this at build time, but this script uploads whatever
 * sits at the path — and the staleness gate above only compares timestamps, so
 * an old debug-signed bundle with no source changes since would sail through.
 * It matters most for --share: the internal testing track would reject a wrong
 * upload key, but internal app sharing re-signs with Play's own internal test
 * certificate and would happily distribute it.
 *
 * An AAB is a signed jar, so this is jarsigner, not apksigner.
 */
if (aab) {
  let signer = '';
  try {
    signer = execFileSync(
      'jarsigner',
      ['-verify', '-verbose:summary', '-certs', AAB],
      { encoding: 'utf8' },
    ).match(/Signed by "(.*)"/)?.[1] ?? '';
  } catch {
    signer = '';
  }
  if (!signer) die(`Could not read a signature from ${AAB}. Rebuild: npm run build:aab`);
  if (/CN=Android Debug/i.test(signer)) {
    die(`REFUSING: that bundle is signed with the DEBUG key (${signer}).\nRebuild with the upload key: npm run build:aab`);
  }
  console.log(`signed by ${signer}`);
}

const keyFile = await stat(KEY).catch(() => null);
if (!keyFile) {
  die(
    `No Play service-account key at ${KEY}\n` +
      `Put the JSON there (never in the repo — it is public), or set SK_PLAY_KEY.\n` +
      `See docs/DEPLOY.md § Publishing from the command line.`,
  );
}

const auth = new GoogleAuth({
  keyFile: KEY,
  scopes: ['https://www.googleapis.com/auth/androidpublisher'],
});
const client = await auth.getClient();
const { token } = await client.getAccessToken();
if (!token) die('Could not get an access token from the service-account key.');

const api = async (method, path, payload) => {
  const res = await fetch(`${API}/androidpublisher/v3/applications/${pkg}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(payload ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(payload ? { body: JSON.stringify(payload) } : {}),
  });
  const text = await res.text();
  if (!res.ok) die(`${method} ${path} failed (${res.status})\n${text}`);
  return text ? JSON.parse(text) : {};
};

console.log(`\npackage   ${pkg}`);
console.log(`version   ${version}`);
console.log(
  `bundle    ${aab ? `${(aab.size / 1024 / 1024).toFixed(1)} MB, built ${new Date(aab.mtimeMs).toISOString()}` : 'none built yet'}`,
);
console.log(`key       ${KEY}`);
console.log(`target    ${toTrack ? 'internal TESTING track (the team sees this)' : 'internal app sharing (link only)'}`);

if (check) {
  /*
   * PROVE AUTHORIZATION, not just authentication.
   *
   * A service-account key mints an access token whether or not Play Console has
   * granted it anything, so "we got a token" would report success for a setup
   * that fails at the first upload with a 403. Inserting an edit and deleting it
   * exercises the exact permission the real run needs and leaves nothing behind.
   */
  const probe = await api('POST', '/edits');
  await api('DELETE', `/edits/${probe.id}`);
  const verdict = staleNote
    ? '--check: the service account can release to this app, but the bundle\nabove is stale — a real run would refuse it.'
    : '--check: gates pass, and the service account really can release to this\napp (an edit was created and discarded).';
  console.log(`\n${verdict}\nNothing was uploaded.\n`);
  process.exit(0);
}

const body = await readFile(AAB);
const upload = async (url) => {
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/octet-stream' },
    body,
    // Uploading tens of megabytes; the API docs ask for a raised timeout.
    signal: AbortSignal.timeout(15 * 60 * 1000),
  });
  const text = await res.text();
  if (!res.ok) die(`Upload failed (${res.status})\n${text}`);
  return JSON.parse(text);
};

let committed = false;
if (!toTrack) {
  console.log('\nUploading to internal app sharing…');
  const out = await upload(
    `${API}/upload/androidpublisher/v3/applications/internalappsharing/${pkg}/artifacts/bundle?uploadType=media`,
  );
  console.log('\nDone. Open this on the phone (signed in as a tester):\n');
  console.log(`  ${out.downloadUrl}\n`);
  console.log('It installs that exact build and notifies nobody.');
  console.log(
    'A Play-installed copy must be uninstalled first — different signing key,\n' +
      'so Android refuses it as a signature mismatch. Nothing is lost; state is in Firestore.\n',
  );
} else {
  console.log('\nUploading to the internal testing track…');
  const edit = await api('POST', '/edits');
  /*
   * Discard the edit if anything after this throws. An abandoned edit is not
   * fatal — Play expires them — but leaving drafts behind after a failed
   * publish makes the Console state ambiguous the next time someone looks.
   */
  process.on('exit', (code) => {
    if (code !== 0 && !committed) {
      console.error(`\nDiscarding the unfinished edit ${edit.id}.`);
    }
  });
  const bundle = await upload(
    `${API}/upload/androidpublisher/v3/applications/${pkg}/edits/${edit.id}/bundles?uploadType=media`,
  );
  console.log(`  uploaded versionCode ${bundle.versionCode}`);
  await api('PUT', `/edits/${edit.id}/tracks/internal`, {
    track: 'internal',
    releases: [{ versionCodes: [String(bundle.versionCode)], status: 'completed' }],
  });
  await api('POST', `/edits/${edit.id}:commit`);
  committed = true;
  console.log(`\nDone. v${version} (code ${bundle.versionCode}) is on the internal testing track.`);
  console.log('Testers get it from Play; propagation takes a few minutes.\n');
}
