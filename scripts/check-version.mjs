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

/**
 * Three integers, and NO LEADING ZEROS.
 *
 * The obvious `^\d+\.\d+\.\d+$` has a hole, found in review by the maintainer of
 * a sibling project: it accepts `2026.07.01`. Apple accepts that too — it is
 * digits and periods — but `07` and `7` are the same number, so a date-style
 * scheme silently produces versions that do not increase, and every numeric
 * derivation downstream (the Android versionCode) reads 7 where a human reads
 * 07. Rejecting the shape outright is the only place that is cheap to fix.
 */
const SHAPE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export function checkVersion(version) {
  const problems = [];
  if (!SHAPE.test(version)) {
    problems.push(
      `"${version}" is not three period-separated integers (X.Y.Z) without leading zeros.\n` +
        '    No pre-release suffix, no fourth component, no leading "v", no "07".\n' +
        '    App Store Connect rejects the first three; the last is legal to Apple\n' +
        '    but means 07 and 7 are the same version.',
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
  return problems;
}

/**
 * The validator checks itself, every run.
 *
 * Also the sibling maintainer's suggestion, and it earns its microseconds: the
 * leading-zero hole above existed precisely because the regex was never pointed
 * at a date. A self-test that only runs when someone remembers to run it is the
 * same as no self-test.
 */
const MUST_REJECT = [
  '1.2.3-beta.1', // pre-release suffix
  '1.2.3.4', // fourth component
  'v1.2.3', // tag prefix leaking into the bundle
  '2026.07.01', // leading zeros: 07 and 7 are one number
  '1.2', // too few components
  '0.1.1000', // overflows the versionCode field
  '1.2.3 ', // stray whitespace
];
const MUST_ACCEPT = ['0.0.1', '0.1.33', '1.0.0', '2147.999.999'];

for (const bad of MUST_REJECT) {
  if (checkVersion(bad).length === 0) {
    console.error(`\ncheck-version.mjs SELF-TEST FAILED: "${bad}" should be rejected\n`);
    process.exit(2);
  }
}
for (const good of MUST_ACCEPT) {
  const problems = checkVersion(good);
  if (problems.length > 0) {
    console.error(
      `\ncheck-version.mjs SELF-TEST FAILED: "${good}" should be accepted\n  ${problems[0]}\n`,
    );
    process.exit(2);
  }
}

const root = resolve(import.meta.dirname, '..');
const version = JSON.parse(
  readFileSync(resolve(root, 'app/app.json'), 'utf8'),
).expo.version;

const problems = checkVersion(version);
if (problems.length > 0) {
  console.error('\nversion check FAILED (app/app.json → expo.version)\n');
  for (const p of problems) console.error(`  - ${p}\n`);
  process.exit(1);
}

console.log(`version ok (${version}, store-legal; ${MUST_REJECT.length} bad shapes self-tested)`);
