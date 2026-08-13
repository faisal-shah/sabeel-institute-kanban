// Guard the iOS config, which is spread across two files that must agree.
//
// `GoogleService-Info.plist` is downloaded from the Firebase console and
// `app/app.json` is written by hand, so nothing but this script stops them
// drifting. Every failure below has already happened once, or is a documented
// Apple/Google rejection that surfaces only at upload or at runtime — long after
// the build that caused it succeeded.
//
// Run: node scripts/check-ios-config.mjs   (also `npm run check:ios`)
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const problems = [];
const fail = (msg) => problems.push(msg);
/**
 * For things that are only wrong ON THE BUILD MACHINE.
 *
 * A hard failure would be wrong: this script is run from any checkout, and the
 * Sentry build variables below only have to exist in the shell that archives.
 * But they cannot be silent either — a missing token skips the symbol upload
 * without failing the build, so the first evidence would be an unreadable crash
 * report weeks later.
 */
const warnings = [];
const warn = (msg) => warnings.push(msg);

const app = JSON.parse(readFileSync(resolve(root, 'app/app.json'), 'utf8')).expo;
const plistPath = resolve(root, 'app/GoogleService-Info.plist');

/**
 * Minimal plist reader — <key>NAME</key><string>VALUE</string> pairs.
 *
 * Deliberately not a dependency: this runs in CI on a checkout, and the file is
 * a flat string dictionary. Booleans are irrelevant here.
 */
function readPlist(path) {
  const xml = readFileSync(path, 'utf8');
  const out = {};
  const re = /<key>([^<]+)<\/key>\s*<string>([^<]*)<\/string>/g;
  for (const m of xml.matchAll(re)) out[m[1]] = m[2];
  return out;
}

// 1. The plist has to exist at all. Without it `expo prebuild` fails late, with
//    an error that names a path rather than the console step you skipped.
if (!existsSync(plistPath)) {
  fail(
    'app/GoogleService-Info.plist is missing.\n' +
      '    Download it from the Firebase console: Project settings -> your iOS app.\n' +
      '    It is committed by design, exactly like google-services.json — the values\n' +
      '    in it are client identifiers, not secrets, and the rules are enforced server-side.',
  );
} else {
  const plist = readPlist(plistPath);
  const ios = app.ios ?? {};

  // 2. Bundle identifier. A mismatch here is the one that wastes a whole build:
  //    the Firebase iOS SDK reads the plist, sees a different bundle id than the
  //    app it is running in, and sign-in fails in ways that look like a network
  //    or credential problem.
  if (!ios.bundleIdentifier) {
    fail('app.json has no expo.ios.bundleIdentifier.');
  } else if (plist.BUNDLE_ID !== ios.bundleIdentifier) {
    fail(
      `bundle id mismatch: app.json says "${ios.bundleIdentifier}",\n` +
        `    GoogleService-Info.plist says "${plist.BUNDLE_ID}".\n` +
        '    Firebase cannot rename a bundle id — register a NEW iOS app on the right\n' +
        '    bundle id, download its plist, and delete the wrong registration.',
    );
  }

  // 3. Same Firebase PROJECT as Android. Registering the iOS app under a sibling
  //    project is easy to do and points the phone at a different database, with
  //    no error anywhere — it just finds no boards.
  const gs = JSON.parse(readFileSync(resolve(root, 'app/google-services.json'), 'utf8'));
  const androidProject = gs.project_info?.project_id;
  if (plist.PROJECT_ID !== androidProject) {
    fail(
      `Firebase project mismatch: the plist is for "${plist.PROJECT_ID}" but\n` +
        `    google-services.json is for "${androidProject}". iOS and Android must be\n` +
        '    two apps inside ONE project, not one app in each of two projects.',
    );
  }

  // 4. The Google Sign-In URL scheme. Miss it and sign-in fails in the most
  //    confusing way available: Safari opens, you choose an account, and the app
  //    never regains focus — no error, because nothing is registered to receive
  //    the callback.
  //
  //    The scheme is NOT written in app.json. Registered bare, the plugin reads
  //    the plist and derives the scheme from REVERSED_CLIENT_ID itself; given an
  //    options object it demands the value be repeated by hand instead. Bare is
  //    what keeps the plist the single source, so assert the shape stays bare —
  //    a well-meaning future edit adding `iosUrlScheme` would reintroduce a copy
  //    that can drift from the file it was copied from.
  const NAME = '@react-native-google-signin/google-signin';
  const plugins = app.plugins ?? [];
  const bare = plugins.includes(NAME);
  const withOptions = plugins.find((p) => Array.isArray(p) && p[0] === NAME);
  if (!bare && !withOptions) {
    fail(`app.json plugins is missing "${NAME}".`);
  } else if (withOptions) {
    fail(
      `"${NAME}" is configured with options, which forces iosUrlScheme to be\n` +
        '    duplicated in app.json. Register it bare — as the plain string — and the\n' +
        '    plugin reads REVERSED_CLIENT_ID out of GoogleService-Info.plist instead.',
    );
  }
  if (!plist.REVERSED_CLIENT_ID) {
    fail(
      'the plist has no REVERSED_CLIENT_ID, so no Google Sign-In URL scheme can be\n' +
        '    derived. Enable Google as a sign-in provider in Firebase Authentication,\n' +
        '    then re-download the plist.',
    );
  }

  // 4b. The Sentry plugin, which is what makes an iOS crash report readable.
  //
  // Registered BARE, like the one above and for the same reason: given
  // `organization`/`project` it writes them into `ios/sentry.properties`, and
  // this repo is public. Bare, the plugin falls back to SENTRY_ORG and
  // SENTRY_PROJECT from the environment at build time — which is also where the
  // auth token has to come from, so all three arrive the same way and none of
  // them is in git. Never pass `authToken` here: the plugin itself warns that it
  // would be written into the application package.
  const SENTRY = '@sentry/react-native/expo';
  if (!plugins.includes(SENTRY)) {
    if (plugins.find((p) => Array.isArray(p) && p[0] === SENTRY)) {
      fail(
        `"${SENTRY}" is configured with options. Register it bare — this repo is\n` +
          '    public, and options are written verbatim into ios/sentry.properties.\n' +
          '    Supply SENTRY_ORG and SENTRY_PROJECT in the build environment instead.',
      );
    } else {
      fail(
        `app.json plugins is missing "${SENTRY}", so no dSYM upload is wired and\n` +
          '    every iOS crash arrives as raw addresses instead of function names.',
      );
    }
  }
}

// 5. Export compliance. Leaving this out does not fail a build — it parks every
//    upload behind a manual questionnaire in App Store Connect before testers
//    can see it.
if (app.ios?.config?.usesNonExemptEncryption !== false) {
  fail(
    'expo.ios.config.usesNonExemptEncryption must be explicitly false.\n' +
      '    Otherwise App Store Connect holds each build for a manual export-compliance answer.',
  );
}

// 6. ONE version string. `ios.version` would override the root version, giving
//    Apple a different number than Android and web — a second source of truth for
//    the thing check-version.mjs exists to keep single. The root version already
//    satisfies Apple's format, and check-version.mjs is what keeps it that way.
if (app.ios?.version) {
  fail(
    `expo.ios.version is set ("${app.ios.version}"), which overrides expo.version.\n` +
      '    Remove it. This repo already constrains expo.version to Apple\'s X.Y.Z shape\n' +
      '    (scripts/check-version.mjs), so the override buys nothing and can drift.',
  );
}

// 7. buildNumber must be a plain integer string. Apple requires it to increase
//    for every upload within a version; a non-numeric value cannot be bumped.
const build = app.ios?.buildNumber;
if (build !== undefined && !/^\d+$/.test(build)) {
  fail(`expo.ios.buildNumber must be a whole number as a string; got "${build}".`);
}

// 8. The icon may not carry an alpha channel. Apple rejects transparency at
//    UPLOAD, after the archive is built and signed. Read the PNG header rather
//    than pulling in an image library: byte 25 of IHDR is the colour type, and
//    4 (grey+alpha) or 6 (RGBA) means an alpha channel is present.
const iconPath = resolve(root, 'app', (app.icon ?? './assets/icon.png').replace(/^\.\//, ''));
if (!existsSync(iconPath)) {
  fail(`expo.icon points at ${iconPath}, which does not exist.`);
} else {
  const png = readFileSync(iconPath);
  const isPng = png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (!isPng) {
    fail(`${iconPath} is not a PNG.`);
  } else {
    const colourType = png[25];
    const width = png.readUInt32BE(16);
    const height = png.readUInt32BE(20);
    if (colourType === 4 || colourType === 6) {
      fail(
        `${iconPath} has an alpha channel (PNG colour type ${colourType}).\n` +
          '    Apple rejects app icons with transparency, and does it at upload.\n' +
          "    Flatten it: python3 -c \"from PIL import Image; Image.open('PATH').convert('RGB').save('PATH')\"",
      );
    }
    if (width !== 1024 || height !== 1024) {
      fail(`${iconPath} is ${width}x${height}; the App Store icon must be 1024x1024.`);
    }
  }
}

// 9. Crash reporting must actually be switched on.
//
// `app/.env.local` is gitignored on purpose — the DSN is not secret (it ships in
// every bundle) but keeping it out of git stops a fork inheriting this project's
// Sentry quota. The cost is that a FRESH CLONE does not have it, and nothing
// about the resulting build looks wrong: `initErrorReporting()` sees no DSN,
// returns early, and the app ships with crash reporting silently off. There is
// no error, no warning, and no way to tell from the artifact.
//
// That is precisely the shape this repo guards rather than remembers, so this is
// a hard failure even though the value only matters for release builds. A
// missing DSN costs thirty seconds to fix and is invisible for months if missed.
const envPath = resolve(root, 'app/.env.local');
if (!existsSync(envPath)) {
  fail(
    'app/.env.local is missing, so the build would ship with crash reporting OFF.\n' +
      '    It is gitignored by design, so a fresh clone never has it. Create it with:\n' +
      '      EXPO_PUBLIC_SENTRY_DSN_NATIVE=<DSN from Sentry -> project -> Client Keys>\n' +
      '    Nothing about the resulting build looks wrong without it — that is why this fails here.',
  );
} else {
  const env = readFileSync(envPath, 'utf8');
  const dsn = env.match(/^\s*EXPO_PUBLIC_SENTRY_DSN_NATIVE\s*=\s*(\S+)/m)?.[1];
  if (!dsn) {
    fail('app/.env.local has no EXPO_PUBLIC_SENTRY_DSN_NATIVE, so native crash reporting is off.');
  } else if (!/^https:\/\/[^@]+@/.test(dsn)) {
    fail(`EXPO_PUBLIC_SENTRY_DSN_NATIVE does not look like a Sentry DSN ("${dsn.slice(0, 12)}…").`);
  }
}

// 10. The three Sentry build variables, which are needed only where you archive.
//
// The plugin is registered bare (see 4b), so it takes org, project and the auth
// token from the environment. Missing, the Xcode build still SUCCEEDS and simply
// does not upload debug symbols — so the first sign is a crash report full of
// hex addresses, long after the build that caused it. Warned rather than failed,
// because only the Mac doing the archive needs them.
const SENTRY_BUILD_VARS = ['SENTRY_ORG', 'SENTRY_PROJECT', 'SENTRY_AUTH_TOKEN'];
const missingSentry = SENTRY_BUILD_VARS.filter((v) => !process.env[v]);
if (missingSentry.length) {
  warn(
    `${missingSentry.join(', ')} not set in this shell.\n` +
      '    Harmless anywhere but the Mac you archive on. There, their absence means\n' +
      '    the build succeeds and silently uploads no dSYMs, so iOS crashes report as\n' +
      '    raw addresses instead of function names.\n' +
      '    The token is an ORGANIZATION token — Sentry -> Settings -> Developer\n' +
      '    Settings -> Organization Tokens, scope org:ci. Org tokens reach every\n' +
      '    project in the org, so one serves every Sabeel app; only SENTRY_PROJECT\n' +
      '    differs. It is a real secret; Sentry shows its value only once.\n' +
      '    NOTE an export in your shell does NOT reach an Xcode GUI build — build\n' +
      '    phases run sanitised and Xcode 15+ ignores the launching terminal. Fill\n' +
      '    in app/ios/sentry.properties (gitignored, but rewritten by every\n' +
      '    prebuild) or archive with xcodebuild. See docs/SECRETS.md.',
  );
}

if (warnings.length > 0) {
  console.warn('\niOS config warnings (build-machine only)\n');
  for (const w of warnings) console.warn(`  ! ${w}\n`);
}

if (problems.length > 0) {
  console.error('\niOS config check FAILED\n');
  for (const p of problems) console.error(`  - ${p}\n`);
  process.exit(1);
}

console.log(`iOS config ok (${app.ios.bundleIdentifier}, v${app.version} build ${app.ios.buildNumber})`);
