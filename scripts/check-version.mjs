// The app version must stay legal on every store we might ever ship to.
//
// Apple's rules are the strictest and the least forgiving, and you find out you
// broke them at SUBMISSION time — after the version is already tagged, released
// and installed. From Technical Note TN2420:
//
//   - digits and periods only, beginning and ending with a digit;
//   - at most THREE period-separated components;
//   - at most 18 characters;
//   - strictly increasing and never reused across releases.
//
// So no `1.2.3-beta.1`, no `1.2.3.4`, no `v1.2.3`, no `2026.07`-style dates with
// a leading zero component (legal, but `07` and `7` are the same number and the
// next one may not increase). Android is laxer about the NAME but derives its
// integer versionCode from these components — see app/android/app/build.gradle,
// where two-digit fields once let 0.1.100 and 0.2.0 collide.
//
// Starting at 0.x is fine and NOT a blocker: 0.1.33 < 1.0.0, so the eventual
// jump to 1.0.0 still increases.
//
// Run from `web:export` (so CI enforces it) and from publish-apk.sh.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const version = JSON.parse(
  readFileSync(resolve(root, 'app/app.json'), 'utf8'),
).expo.version;

const problems = [];
if (!/^\d+\.\d+\.\d+$/.test(version)) {
  problems.push(
    `"${version}" is not three period-separated integers (X.Y.Z).\n` +
      '    No pre-release suffix, no fourth component, no leading "v". App Store\n' +
      '    Connect rejects all three, and the Android versionCode is derived from\n' +
      '    exactly these three numbers.',
  );
}
if (version.length > 18) {
  problems.push(`"${version}" is longer than the 18 characters Apple allows.`);
}
// Mirrors the ceiling in build.gradle. Kept in both places on purpose: Gradle
// must fail even when this script was not run, and this must fail even on a
// web-only release that never touches Gradle.
const [major, minor, patch] = version.split('.').map(Number);
if (minor > 999 || patch > 999 || major > 2147) {
  problems.push(
    `"${version}" overflows the Android versionCode scheme (minor/patch max 999,\n` +
      '    major max 2147). Raise the multipliers in app/android/app/build.gradle\n' +
      '    together with this check — and only ever upward, or codes stop increasing.',
  );
}

if (problems.length > 0) {
  console.error('\nversion check FAILED (app/app.json → expo.version)\n');
  for (const p of problems) console.error(`  - ${p}\n`);
  process.exit(1);
}

console.log(`version ok (${version}, store-legal)`);
