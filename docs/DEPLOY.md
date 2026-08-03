# Deploy guide

Everything through Phase 12 runs against the emulators with no real project.
Deploying is the point where the console steps in `TODO.md` must be done first.

## Prerequisites

1. Complete `TODO.md` sections B, C and D — Firebase project (Blaze), Google
   sign-in enabled, OAuth consent screen **External and published** (see
   TODO.md § C for why not Internal), Web and Android apps registered, SHA-1
   added, `google-services.json` downloaded.
2. Put the real project id in `.firebaserc`.
3. Replace the placeholder config in `app/src/firebase-config.ts` with the real
   web config. **Keep `EMULATOR_PROJECT_ID` as it is** — it is what makes local
   development point at the emulators.
4. Optional but recommended: `firebase functions:secrets:set SENTRY_DSN`.

## Deploy

```sh
# Indexes FIRST — they take minutes to build, and queries error until they exist.
firebase deploy --only firestore:indexes

# Then rules, functions and the web app.
firebase deploy --only firestore:rules,storage,functions,hosting
```

It is `storage`, **not** `storage:rules`. The `storage` block in `firebase.json`
is a single unnamed config, so a named target does not exist and `storage:rules`
errors with "Could not find rules for the following storage targets: rules".

Hosting serves `app/dist-web`, built automatically by the predeploy hook.

**Attachments cannot be fully verified before this deploy.** The Storage
emulator has no signing service, so `getAttachmentUrl` takes a different branch
locally and the `roles/iam.serviceAccountTokenCreator` grant it depends on fails
ONLY in production. After deploying, upload a file and open it, and confirm the
URL carries `X-Goog-Signature`. Note an expired GCS signed URL answers **HTTP
400 `ExpiredToken`**, not 403.

## First admin

Everyone lands `pending` and only an admin can approve, so the first admin has to
be made from outside the app. `scripts/grant-admin.mjs` does this with the Admin
SDK, but it needs gcloud ADC or `GOOGLE_APPLICATION_CREDENTIALS`:

```sh
GCLOUD_PROJECT=sabeel-institute-kanban node scripts/grant-admin.mjs you@oursabeel.com
```

**Without those credentials**, the fallback is a temporary one-shot function.
This project was bootstrapped that way on 2026-07-19; the file no longer exists,
because step 4 is to delete it. Recreate it as `functions/src/bootstrap.ts` only
if you are standing up a *new* project:

1. Sign in through the app once so the account exists (you will land `pending`).
2. `firebase deploy --only functions:bootstrapFirstAdmin`
3. `curl https://us-central1-sabeel-institute-kanban.cloudfunctions.net/bootstrapFirstAdmin`
4. **Delete it** — the export in `functions/src/index.ts`, the file, then
   `firebase functions:delete bootstrapFirstAdmin --region us-central1`.
5. Sign out and back in to pick up the claim.

It is safe for the minutes it exists by construction, not secrecy: it can only
ever promote one hardcoded address, it refuses once any admin exists, and it
re-checks the verified-domain rule. Delete it anyway — a spent one-shot left
lying around is a thing someone later has to reason about.

From then on, promote everyone else in-app under **People**.

## Public download page — RETIRED, frozen at v0.7.4

The team used to download an APK from a GitHub Pages site:

<https://faisal-shah.github.io/sabeel-kanban/>

**Android ships through Google Play from v0.7.5 (2026-08-02).** That page is
frozen at v0.7.4 — the last debug-signed build — and comes down once everyone has
moved across. It is frozen rather than updated because every build from now on
carries the real upload key, and **Android refuses to update an install whose
signature does not match**: a newer APK there would give "App not installed" to
exactly the people who already have the app. `scripts/publish-apk.sh` now refuses
to run without `SK_LEGACY_APK_CHANNEL=1`, kept working only so the frozen asset
can be restored if lost.

**Never `git add` an APK — to that repo or any other.** Committing a binary per
release is what bloated the pages history (~31 MB each) and had to be rewritten
out; `*.apk` is gitignored there as the backstop. That rule outlives the channel.

## Android releases — Google Play

```sh
npm run build:aab
# outputs app/android/app/build/outputs/bundle/release/app-release.aab
```

Then Play Console → Testing → Internal testing → Create new release.

`build-aab.sh` holds the gates the old publish script did: a store-legal version,
a deploy-log entry that exists **before** the build, and a refusal to proceed on
a debug signature. Play wants one bundle carrying every ABI and does its own
per-device splitting, so the `splits` block turns itself off for bundle tasks —
leaving both on fails with *"Multiple shrunk-resources files found"*.

### Three SHA-1s, because there are three signing identities

All three belong in Firebase; each covers a different way the app gets onto a
device, and a missing one fails only for that route:

| Build | Signed with | Needed for |
|---|---|---|
| `npm run dev:android`, `expo run:android` | committed debug keystore | day-to-day development |
| `npm run build:apk` (sideload) | upload key, `~/keys/…jks` | quick testing of a real release build |
| installed from Play | **Google's app signing key** | everyone actually using the app |

The third is the one that gets forgotten, because Play App Signing re-signs the
bundle: the fingerprint under Play Console → App integrity → *App signing key
certificate* is what Play-installed copies run under, not the upload key's. Miss
it and sign-in fails with `DEVELOPER_ERROR` for Play users only, while every
build on your own machine works — so it reads as a device problem.

### DEVELOPER_ERROR on a Play install — diagnose in this order

Sign-in fails only for Play-installed copies while every local build works. The
cause is almost always the app signing fingerprint, but "registered" and
"in effect" are different things, so check in this order rather than rebuilding:

1. **Is the fingerprint registered?** Google Cloud Console -> APIs & Services ->
   **Credentials** -> OAuth 2.0 Client IDs. There should be one **Android** client
   per registered SHA-1 — debug, upload key, and Play's app signing key — each
   marked "Auto created by Google service", which is Firebase creating them when a
   fingerprint is added. Three entries for one package is correct, not a
   duplicate.
2. **If it is there, it is propagation.** OAuth client changes take minutes and
   sometimes hours. Force-stop the app and retry; then clear the device's Google
   Play services cache (Settings -> Apps -> Google Play services -> Storage ->
   Clear cache), because the config is cached device-side and that cache outlives
   the server-side change.
3. **Only then consider a rebuild** — and note the cost: a re-upload needs a NEW
   versionCode, which is derived from the version, so it means bumping the
   version and writing a deploy-log entry, not just rebuilding.

The bundled `google-services.json` is *believed* not to matter at runtime here —
`WEB_CLIENT_ID` is a hardcoded constant in `app/src/firebase-config.ts` and the
package/signature check is server-side — so a bundle built before the fingerprint
was added should still work. If step 3 ever turns out to be the actual fix, that
belief is wrong and this paragraph should say so.

### Debug installs alongside; the two release builds do not

Debug builds carry `applicationIdSuffix '.debug'`, so
**`com.sabeelinstitute.kanban.debug`** is a separate app to Android and sits on
the same device as the real one. Its launcher label is **"Sabeel Kanban (dev)"**
(`app/android/app/src/debug/res/values/strings.xml` — a build-type source set,
because declaring `app_name` again via `resValue` collides with `src/main/res`).

Two consequences worth knowing:

- **It is a different app to Firebase too**, registered separately with the debug
  SHA-1. Without that registration the google-services plugin fails the build
  outright: *"No matching client found for package name"*.
- **`expo run:android` does not know about the suffix.** It reads the id with a
  regex over the `applicationId` line alone, so it would install the `.debug` APK
  and then try to launch the unsuffixed package. `npm run dev:android` passes
  `--app-id com.sabeelinstitute.kanban.debug` to correct that.

**A sideloaded release APK and a Play install still collide** — both are
`com.sabeelinstitute.kanban` with different signatures, so neither can replace
the other. Uninstall to move between those two.

### Android developer verification, and why it does not threaten dev builds

Google's developer-verification programme links a package name to its signing
keys, and unverified apps eventually cannot be installed. Two facts bound what
it means here, both from Google's FAQ rather than inference:

- **ADB installs are exempt, permanently and by design** — *"As a developer, you
  are free to install apps without verification with ADB."* That covers debug
  builds and locally sideloaded APKs, so `npm run dev:android` is unaffected
  whatever happens to the timeline.
- **`com.sabeelinstitute.kanban.debug` needs no registration.** Registration
  applies to apps distributed to end users through a store, not to a package that
  only ever reaches a device over adb.

The **30 September 2026** date is narrower than it first reads: it covers only
specific participating stores in Brazil, Indonesia, Singapore and Thailand.
Global rollout is **2027**. Creating the app in Play Console registered
`com.sabeelinstitute.kanban` automatically, so the Play route is already covered.

The one thing with a real horizon is the **website APK download**: by the 2027
global rollout, an app sideloaded from a page rather than a store needs its
signing key registered under Play Console -> Android developer verification.
Retiring that channel resolves it; so would registering the upload key there.

### Building a sideloadable APK

Still supported and unchanged; it is just no longer published anywhere:

```sh
npm run build:apk
# outputs app/android/app/build/outputs/apk/release/app-<abi>-release.apk
```

Per-ABI splits plus R8 take arm64 from 82 MB to 27 MB. Both R8 flags are ON in
`gradle.properties` and both are OFF by default in the React Native template.

**`./gradlew clean` can fail** in `externalNativeBuildCleanDebug` while CMake
regenerates. Delete the caches instead:

```sh
rm -rf app/android/app/.cxx app/android/app/build
```

**After any change to R8 or splits, install and RUN the result** — R8 strips
classes reached only by reflection, and Google Sign-In is exactly that kind of
dependency. A smaller APK that crashes on launch is worse than a large one that
works:

```sh
adb install app/android/app/build/outputs/apk/release/app-x86_64-release.apk
adb shell monkey -p com.sabeelinstitute.kanban -c android.intent.category.LAUNCHER 1
adb exec-out screencap -p > shots/check.png     # then LOOK at it
```

**Signing.** `signingConfigs.release` reads a gitignored
`app/android/keystore.properties`; without it the build still works but is
debug-signed and says so loudly. Everything up to and including v0.7.4 shipped
that way, signed with the debug keystore committed to this **public** repo, so
anyone with a clone could sign an update Android would accept as this app. That
is closed for release builds.

The debug keystore is still committed and its SHA-1 still registered, on purpose:
it is what makes `npm run dev:android` sign in without per-machine setup. The
residual is unchanged and accepted — a malicious build carrying that key and this
package name is indistinguishable to Google Sign-In. What bounds it is that
sign-in is `@oursabeel.com`-only and admin-gated, and that a dozen colleagues
install deliberately. If that ever stops being true, replace the committed debug
keystore with a per-machine one and register those fingerprints instead.

## Verify after deploy — do not skip

**1. Composite indexes (REQUIRED).** The emulator does NOT enforce them, so only
production can confirm they exist and are built. Exercise each indexed query:

- Open a board (needs `cards: archived + rank`).
- Open **My work** (needs the `cards` collection-group index on
  `assigneeUids + archived + dueDate`).
- Open **Alerts** (needs `notifications: read + at`).

A missing index surfaces as a listener error with a link that creates it. If you
see one, add the definition to `firestore.indexes.json` too — the console link
creates it in the project only, and the repo is the source of truth.

**2. Callables are reachable.** An unauthenticated

```sh
curl -X POST https://us-central1-<project>.cloudfunctions.net/setUserAccess -d '{"data":{}}'
```

should return a Firebase JSON error (`UNAUTHENTICATED`) — meaning your code ran.
A plain Cloud Run "request was not authenticated" 403 means the public-invoker
binding was never applied. See the trap below.

**3. Sign in end to end** with a real `@oursabeel.com` account, and confirm a
non-org account is rejected.

## Known traps

These cost real time on the sibling time-tracker project; see
`docs/INHERITED-STACK.md` for the full accounts.

**Callables permanently 403 after a failed first deploy.** Gen-2 callables get
their public-invoker IAM binding only on the *create* path. If the first deploy
creates the function but the build fails, later deploys never re-apply it and
every call bounces at the Cloud Run layer before your code runs. Fix by forcing
recreation:

```sh
firebase functions:delete setUserAccess removeBoardMember countMemberAssignments \
  --region us-central1 --force
firebase deploy --only functions
```

**First deploy of a Firestore-trigger function fails on the Eventarc service
agent.** Not a config error — permissions take 2–5 minutes to propagate. Wait,
then redeploy just the failed functions.

**Functions must be esbuild-bundled.** Already configured. `functions/build` is
`tsc --noEmit` plus `node esbuild.config.mjs`; the bundle inlines the private
`@sabeel/shared` package, which Cloud Build cannot otherwise resolve.

**`expo export` must always `--clear`.** Configured in `web:export`. Metro will
otherwise serve a bundle built with different `EXPO_PUBLIC_*` values, and an
emulator-mode bundle must never reach Hosting.

## Shipping a release

`android/` is committed; there is no EAS. A ship touches three surfaces and they
go out in one batch, after Faisal's go-ahead.

```sh
# 0. version bump in app/app.json + the deploy-log entry in docs/PHASE_STATUS.md
git push origin main                                  # FIRST — a release tags a pushed commit
npx firebase deploy --only hosting --project sabeel-institute-kanban
npm run build:aab                                     # then upload at Play Console
cd app && npx expo prebuild --platform ios && ...     # docs/IOS-BUILD.md
```

Before sharing any build:

1. **Install it and screenshot the sign-in screen** — the dev sign-in row must be
   absent, and the version/commit stamp must be the build you just cut. The e2e
   suite asserts this for the web bundle on every run; a store build deserves the
   same one-off check, read off the running app rather than inferred.
2. **Read the version back from the artifact, not from your notes.** Web: load the
   live site and read the stamp. Android: install and look. This has caught a
   stale bundle more than once.

The **deploy-log entry in `docs/PHASE_STATUS.md` is mandatory and comes first** —
`build-aab.sh` refuses to build without one, the same guarantee `publish-apk.sh`
used to enforce by reading its release notes from it. It is the only record of
why a release exists.

### Play specifics

- Uploading is manual, in the console. There is deliberately **no deploy from
  CI** (see `CLAUDE.md`).
- `versionCode` is derived from the semver (`major*1000000 + minor*1000 + patch`),
  so it increases on its own. Play rejects a duplicate outright, which is the
  backstop.
- Processing takes a few minutes before a build appears on the testing track.
- Historic note: tagging a GitHub release at a commit whose `.github/workflows`
  differs from the default branch needs the `workflow` token scope
  (`gh auth refresh -h github.com -s workflow`). Only relevant if versioned
  GitHub releases are ever cut again — a normal ship tags HEAD and never hits it.

## Rollback

Hosting keeps previous releases — roll back from the console in one click.
Functions and rules do not: redeploy the previous commit. For Firestore data, see
disaster recovery below — boards still archive rather than delete, and only
managers may permanently remove cards, because prevention beats restoring.

### Restoring across the label migration

A restore from a backup taken **before 2026-07-27** brings back boards that still
carry a `labels` array and a `labels` collection that may be missing entries. The
deployed rules reject a board write containing that field, so managers would find
those boards uneditable, and any label not in the collection would render as
nothing on its cards.

Re-run the migration after such a restore:

```
GCLOUD_PROJECT=sabeel-institute-kanban node scripts/migrate-global-labels.mjs part-a
GCLOUD_PROJECT=sabeel-institute-kanban node scripts/migrate-global-labels.mjs part-b
```

Both are idempotent and both abort rather than guess — part A on a duplicate id
or a label the rules would refuse, part B if anything has not been copied yet.

## Backups and disaster recovery

Two native Firestore layers, both Google-managed settings with no code to
maintain. They do different jobs and compose:

| Layer | Window | What it answers |
|---|---|---|
| **PITR** | rolling **7 days** | "someone deleted it this morning" — rewind to any microsecond |
| **Daily backup** (98-day retention) | **14 weeks** | "we noticed in September that something broke in July" |

98 days is Firestore's **maximum** retention — it will not keep a backup longer.
Both PITR and backup data are **excluded from the free tier** and need billing
enabled (this project is on Blaze); at this data size they bill as fractions of a
cent, but they are a real line item, not zero.

**Delete protection is ENABLED**, so the database itself cannot be deleted until
someone deliberately turns it off.

```sh
# enable (one-time)
firebase firestore:databases:update "(default)" --point-in-time-recovery ENABLED
firebase firestore:backups:schedules:create --recurrence DAILY --retention 98d
firebase firestore:databases:update "(default)" --delete-protection ENABLED

# inspect
firebase firestore:databases:get "(default)"   # PITR + delete-protection state
firebase firestore:backups:schedules:list      # schedule + retention
firebase firestore:backups:list                # backups actually taken
```

### Restoring — read this BEFORE you need it

A restore **always creates a NEW database**. There is no restore-in-place, and
the destination id *cannot be one already in use* — so you can never restore
directly over `(default)`, the database every client is configured for.

**Do not plan to "just repoint the app."** Repointing the web is a redeploy, but
repointing an installed Android client is a **new build every user has to
install** — recovery time becomes an app-store round trip. Bring the data back to
the id the clients already use instead:

1. **Restore to a scratch database.**
   `firebase firestore:databases:restore --database recovery-YYYYMMDD --backup <backup-name>`
   (For PITR, recover using a `--snapshot-time` within the last 7 days.)
2. **Verify the scratch copy** actually contains what you expect before touching
   anything live — count boards/cards/users, spot-check a board.
3. **Managed-export the scratch database** to a Cloud Storage bucket, then
   **import it back into `(default)`**.
4. **Delete the scratch database.** Clients never notice any of this.

Two things that bite mid-incident:

- **Import merges by document id.** It recreates what was deleted, but it does
  **not** remove anything that was wrongly added — a clean fix for a deletion,
  only a partial one for a corruption.
- **Backups do not contain security rules, indexes, IAM or TTL policies.** A
  restored database comes up needing them reapplied. Cheap here, because they are
  config-as-code: `firebase deploy --only firestore` puts them back.

### Firebase Auth is NOT in any backup

Firestore backups cover Firestore only. Auth is a separate system, and a uid is
not cosmetic — `memberUids`, `assigneeUids`, `createdBy` and `authorUid` all
reference it. Letting people simply sign in again would mint **new random uids**
and leave a database that restores "successfully" while being quietly wrong
everywhere.

No separate Auth backup is needed, because the roster already lives in Firestore:
`onUserCreate` writes `users/{uid}` with displayName, email, role and status, and
the **doc id is the uid**. So restore Firestore first, then:

```sh
GCLOUD_PROJECT=sabeel-institute-kanban node scripts/restore-auth.mjs           # dry run
GCLOUD_PROJECT=sabeel-institute-kanban node scripts/restore-auth.mjs --apply
```

It recreates each account with its **original uid** and re-applies the `role` /
`status` **custom claims** — which matter because `firestore.rules` trusts the
token, not the user doc; an account restored without claims can sign in and then
do nothing. It is idempotent and never deletes. Everyone must sign in again
afterwards to pick up a token carrying their claims.

**Unproven step:** whether a Google sign-in attaches cleanly to a restored
account with a matching email and uid has not been exercised yet — it is the main
thing the restore drill (TODO.md) is meant to settle. If it refuses to link, the
fallback is `firebase auth:export`, which preserves provider linkage explicitly.

### Detection — the `healthCheck` canary

Retention only helps if the problem is noticed while a good backup still exists.
The bad case is a corruption just before a quiet period: every later backup
faithfully captures the broken state, and by the time anyone looks the last good
one has aged out. `functions/src/health.ts` runs daily at 03:15 (org timezone)
and:

- counts documents per collection using `count()` aggregations, never full reads
  (subcollections — comments, activity, notifications — go through
  `collectionGroup`);
- compares against the previous run stored at `meta/health` (operator state; the
  rules catch-all denies all client access, pinned by a rules test);
- raises to Sentry when a collection shrinks past its tolerance. `boards`,
  `activity` and `users` have **zero tolerance** (the rules forbid deleting the
  first two outright; users go only by deliberate admin action), while `cards`,
  `comments` and `notifications` tolerate `max(5, 20%)` since routine deletion is
  normal there;
- sends a Sentry **cron check-in**, so the job going *silent* is itself an alert.

Tune the thresholds in `DROP_RULES`. It always re-baselines, so a single bad day
alerts once rather than forever. Known limitation: it compares run-to-run, so a
slow bleed of a few documents a day stays under the threshold — it is built to
catch sudden loss, which is what accidents and bad deploys look like.

**When it fires:** check PITR first (`earliestVersionTime` tells you how far back
you can still go), decide whether the drop was legitimate, and if not, follow the
restore steps above while the 7-day window is still open.

**Remaining gap.** Beyond 14 weeks Firestore cannot retain natively; the cheap
mitigation is a deliberate managed export to Cloud Storage before a long break.
