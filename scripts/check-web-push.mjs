#!/usr/bin/env node
/**
 * Did the exported web bundle actually get the VAPID key?
 *
 *     npm run check:web-push        (after `npm run web:export -w @sabeel/app`)
 *
 * WHY THIS EXISTS: the key reaches the bundle from `EXPO_PUBLIC_FCM_VAPID_KEY`
 * in the environment that runs `expo export`. Miss it and nothing fails — the
 * client is inert BY DESIGN, so the build succeeds, the site deploys, and every
 * device quietly reports that it cannot receive notifications. That is the exact
 * signature this whole feature exists to avoid, and it is invisible from source:
 * the source is correct either way.
 *
 * It is visible in the OUTPUT, though, and unmistakably so. With no key, the
 * minifier can prove `canRequestPush()` false and folds the entry point to a
 * bare `return'unavailable'` — the whole permission path deleted from the
 * bundle. That fold is what this looks for, plus the key itself.
 *
 * Deliberately NOT wired into `web:export`: that runs in the e2e harness and in
 * ordinary local work, where building without a key is normal and fine. This is
 * a release gate — run it before deploying the web app.
 *
 * IT READS THE ARTIFACT ON DISK, so run it immediately after the release export
 * and before the deploy, with nothing in between. `dist-web` is shared: an e2e
 * or sweep run rebuilds it, normally with no key, so a check run at any other
 * moment is answering about a different bundle than the one you are shipping.
 * That is also the point — `firebase deploy` ships exactly this directory, so
 * checking it is checking what goes live.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const DIR = join(ROOT, 'app', 'dist-web', '_expo', 'static', 'js', 'web');

/** The Firebase SDK ships its own sample key; finding only that means ours is absent. */
const SDK_DEFAULT = 'BDOU99-h67HcA6JeFXHbSNMu7e2yNNu3RzoMj8TM4W88jITfq7ZmPvIM1Iv-4_l2LxQcYwhqby2xGpWwzjfAnG4';

function fail(msg) {
  console.error(`check-web-push: ${msg}`);
  process.exit(1);
}

let files;
try {
  files = readdirSync(DIR).filter((f) => f.startsWith('index-') && f.endsWith('.js'));
} catch {
  fail(`no export found at ${DIR}\n  build it first: npm run web:export -w @sabeel/app`);
}
if (files.length !== 1) fail(`expected one entry bundle in ${DIR}, found ${files.length}`);

const bundle = readFileSync(join(DIR, files[0]), 'utf8');

// A VAPID public key is an uncompressed P-256 point: 65 bytes, leading 0x04,
// which is 87 base64url characters starting with 'B'.
const keys = [...bundle.matchAll(/["'](B[A-Za-z0-9_-]{86})["']/g)]
  .map((m) => m[1])
  .filter((k) => k !== SDK_DEFAULT);

if (keys.length === 0) {
  fail(
    'no VAPID key in the exported bundle.\n' +
      '  Web push will be inert: every device will report that it cannot receive\n' +
      '  notifications, and nothing else will look wrong.\n' +
      '  Re-export with EXPO_PUBLIC_FCM_VAPID_KEY set (app/.env.local).',
  );
}

// The fold only happens when the key is empty, so this should be unreachable
// once a key is present — it is here because it is the symptom people will see.
if (/enablePush=async function\([^)]*\)\{return['"]unavailable['"]/.test(bundle)) {
  fail('enablePush was folded to a bare "unavailable" — the permission path is not in the bundle.');
}

console.log(`check-web-push: ok — VAPID key present (${keys[0].slice(0, 8)}…), permission path intact`);
