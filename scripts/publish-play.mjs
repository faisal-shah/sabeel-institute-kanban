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
const KEY = process.env.SK_PLAY_KEY ?? join(homedir(), 'keys', 'sabeel-play-publisher.json');
const API = 'https://androidpublisher.googleapis.com';

const args = process.argv.slice(2);
const check = args.includes('--check');
const toTrack = args.includes('--internal');
const pkg = JSON.parse(await readFile(resolve(ROOT, 'app/app.json'), 'utf8')).expo.android.package;
const version = JSON.parse(await readFile(resolve(ROOT, 'app/app.json'), 'utf8')).expo.version;

const die = (m) => {
  console.error(`\n${m}\n`);
  process.exit(1);
};

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
if (!aab) die(`No bundle at ${AAB}\nRun: npm run build:aab`);

/**
 * REFUSE A BUNDLE OLDER THAN THE CODE.
 *
 * The failure this exists for has happened here: an artifact sitting at the
 * output path from a previous build was taken for the new one, and the version
 * it carried was only noticed after it was public. Comparing mtimes catches it
 * without needing to parse a protobuf manifest out of the bundle.
 */
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
const srcNewest = Math.max(
  await newestSource(resolve(ROOT, 'app/src')),
  await newestSource(resolve(ROOT, 'packages/shared/src')),
);
if (srcNewest > aab.mtimeMs) {
  die(
    `The bundle is OLDER than the source.\n` +
      `  bundle: ${new Date(aab.mtimeMs).toISOString()}\n` +
      `  source: ${new Date(srcNewest).toISOString()}\n` +
      `Rebuild with: npm run build:aab`,
  );
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

const mb = (aab.size / 1024 / 1024).toFixed(1);
console.log(`\npackage   ${pkg}`);
console.log(`version   ${version}`);
console.log(`bundle    ${mb} MB, built ${new Date(aab.mtimeMs).toISOString()}`);
console.log(`key       ${KEY}`);
console.log(`target    ${toTrack ? 'internal TESTING track (the team sees this)' : 'internal app sharing (link only)'}`);

if (check) {
  console.log('\n--check: gates pass and the credentials work. Nothing uploaded.\n');
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
  const bundle = await upload(
    `${API}/upload/androidpublisher/v3/applications/${pkg}/edits/${edit.id}/bundles?uploadType=media`,
  );
  console.log(`  uploaded versionCode ${bundle.versionCode}`);
  await api('PUT', `/edits/${edit.id}/tracks/internal`, {
    track: 'internal',
    releases: [{ versionCodes: [String(bundle.versionCode)], status: 'completed' }],
  });
  await api('POST', `/edits/${edit.id}:commit`);
  console.log(`\nDone. v${version} (code ${bundle.versionCode}) is on the internal testing track.`);
  console.log('Testers get it from Play; propagation takes a few minutes.\n');
}
