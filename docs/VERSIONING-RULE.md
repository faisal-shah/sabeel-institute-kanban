# App versioning rule (Apple-safe)

For any Sabeel app that ships, or might one day ship, to a phone store.
Adopting this costs about fifteen minutes now. Discovering it at iOS submission
time costs a re-release, because by then the version is already tagged, built and
installed on people's devices.

## The rule

**The app version is exactly three integers, `X.Y.Z`. One source of truth.
Everything else is derived from it.**

- No pre-release suffix (`1.2.3-beta.1`), no fourth component (`1.2.3.4`), no
  leading `v` (`v1.2.3`), no date-style components with leading zeros
  (`2026.07.01` — legal, but `07` and `7` are the same number, so the next one
  may not increase).
- At most 18 characters.
- Strictly increasing, never reused. Once a version has been published, that
  number is spent forever.
- Keep it in ONE file (for Expo: `app.json` → `expo.version`). Native project
  files must derive from it, never carry their own copy. Two copies desync
  silently, and the symptom is every release reporting the same version to your
  crash reporter.

Starting at `0.x` is fine and is **not** a blocker. `0.1.33 < 1.0.0`, so the
eventual jump to 1.0 still increases.

## Why these exact constraints

They are Apple's, from [Technical Note
TN2420](https://developer.apple.com/library/archive/technotes/tn2420/_index.html).
`CFBundleShortVersionString` must:

- contain only digits and periods, and begin and end with a digit;
- have **at most three** period-separated components;
- be **at most 18 characters**;
- be unique and increase with every release.

Android is far laxer about the version *name* — which is the trap. A scheme that
has worked for years on Android can be rejected the first time it meets App Store
Connect, and nothing warns you in between.

## The part that actually bites first: the Android versionCode

Android needs an integer `versionCode` alongside the name, and the sane thing is
to derive it from the semver. **Be careful how many digits you give each field.**

A common scheme is `major*10000 + minor*100 + patch`. It gives each field two
digits, and it collides:

```
0.1.99  -> 199
0.1.100 -> 200
0.2.0   -> 200   <-- same number
```

Android refuses to install an APK whose `versionCode` is not greater than the
installed one, and Play rejects a duplicate outright. So the release after
`0.1.99` simply does not go out. If you ship patches at any pace, this is much
closer than it looks — we were about two months away.

Use three digits per field:

```
versionCode = major*1000000 + minor*1000 + patch      // 0.1.7 -> 1007
```

Room for 999 minor and 999 patch, and major up to 2147 before Android's signed
32-bit ceiling.

**If you are changing an existing scheme, check the new formula produces a LARGER
number than the old one did for your current version**, or your next release
cannot be installed over the last. Widening from `10000/100` to `1000000/1000`
is safe (`0.1.33`: 133 → 1033). Narrowing never is.

Make the build **fail** on a malformed or out-of-range version rather than
silently computing a wrong number. In Gradle:

```groovy
def expoVersion = new groovy.json.JsonSlurper()
    .parse(file("$projectRoot/app.json")).expo.version
if (!expoVersion.matches(/^\d+\.\d+\.\d+$/)) {
    throw new GradleException("app.json version '${expoVersion}' must be X.Y.Z")
}
def (vMajor, vMinor, vPatch) = expoVersion.tokenize('.').collect { it.toInteger() }
if (vMinor > 999 || vPatch > 999 || vMajor > 2147) {
    throw new GradleException("app.json version '${expoVersion}' overflows the versionCode scheme")
}
def computedVersionCode = vMajor * 1000000 + vMinor * 1000 + vPatch

// ...then, in defaultConfig:
//   versionCode computedVersionCode
//   versionName expoVersion
```

## Enforce it where it cannot be skipped

A convention nobody checks is a convention that lasts until someone is in a
hurry. Wire a check into CI **and** into the release step — the last gate before
a tag and a public download exist, both of which are awkward to retract.

```js
// scripts/check-version.mjs
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const version = JSON.parse(readFileSync(resolve(root, 'app/app.json'), 'utf8')).expo.version;

const problems = [];
if (!/^\d+\.\d+\.\d+$/.test(version)) {
  problems.push(`"${version}" is not three period-separated integers (X.Y.Z). No suffix, no fourth component, no leading "v".`);
}
if (version.length > 18) {
  problems.push(`"${version}" exceeds the 18 characters Apple allows.`);
}
const [major, minor, patch] = version.split('.').map(Number);
if (minor > 999 || patch > 999 || major > 2147) {
  problems.push(`"${version}" overflows the Android versionCode scheme (minor/patch max 999, major max 2147).`);
}

if (problems.length) {
  console.error('\nversion check FAILED (app/app.json -> expo.version)\n');
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`version ok (${version}, store-legal)`);
```

Test it against the shapes it exists to stop — `0.2.0-beta.1`, `1.2.3.4`,
`v1.2.3`, `0.1.1000` — and confirm each is rejected. A validator nobody has seen
reject anything is not known to work.

## When iOS actually happens

The version string above is already what iOS wants for
`CFBundleShortVersionString`. Two things are still outstanding at that point:

- **`CFBundleVersion` (the build number) is separate** and needs its own scheme.
  On iOS it must increase within a version train and may be reused across
  trains; on macOS it must increase monotonically forever and may never be
  reused. Do not assume it can just mirror `versionCode`.
- Git tags may keep a `v` prefix (`v1.2.3`). Apple never sees your tags — only
  the value in the bundle. Do not strip the prefix from tags on Apple's account.
