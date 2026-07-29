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

## Public download page

The team downloads from a GitHub Pages site rather than from the repo's own
releases — a plain page with one button, free bandwidth, no GitHub account and
no navigating a release list:

<https://faisal-shah.github.io/sabeel-kanban/>

**Never `git add` an APK — to that repo or any other.** The download is a GitHub
**Release asset** on the fixed rolling tag `kanban-latest`, so the URL on the
page never changes and only the version *label* is edited. Committing a binary
per release is what bloated the pages history (~31 MB each) and had to be
rewritten out; `*.apk` is gitignored there as the backstop, and
`scripts/publish-apk.sh` fails if a binary ever lands in that history again.

`scripts/publish-apk.sh` is the only supported way to publish. See
**Android release APK** below for the whole sequence.

## Android release APKs

`app/android/` is committed (no EAS). Build locally:

```sh
cd app/android
./gradlew assembleRelease --no-daemon
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

Releases are signed with the **debug keystore** (template default), which is why
the debug SHA-1 is the one registered in Firebase. Before distributing beyond
internal testing, generate a real release keystore and register its SHA-1 — the
debug key is committed to this repo, so anyone could sign an update with it.

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

## Android release APK

`android/` is committed; there is no EAS.

```sh
cd app && npx expo run:android                       # debug build
cd app/android && ./gradlew assembleRelease          # release APK
```

Before sharing a build:

1. Generate a real keystore (the debug key is only for your own device) and
   register its SHA-1 on the Firebase Android app, then re-download
   `google-services.json`.
2. Install the release APK and **screenshot the sign-in screen**: the dev
   sign-in row must be absent. The e2e suite asserts this for the web bundle on
   every run; the APK deserves the same one-off check.
3. Publish with `scripts/publish-apk.sh` — never ad-hoc file sharing. It does
   **both**: replaces the rolling `kanban-latest` asset on the pages repo (the
   constant public download URL) **and** cuts the versioned GitHub Release on
   THIS repo (all four ABI splits + notes pulled from the deploy log via
   `scripts/deploy-notes.mjs`). Release assets are not git blobs, so this does
   not bloat history; the script still guards the pages repo against apk blobs.

   Caveat: tagging a release at a commit whose `.github/workflows` differs from
   the default branch needs the `workflow` token scope. A normal ship tags HEAD
   (its workflow always matches), so it never hits this — but **backfilling old
   versions does**, and needs a one-time `gh auth refresh -h github.com -s
   workflow` first.

4. **Confirm the download page says the right version AND the right time.** The
   script writes both — `Current build: vX.Y.Z, published <date> at <time> EDT`
   — and refuses to continue if either label did not actually change.

   The timestamp is not decoration. The public download URL is a **rolling
   asset**: the page and the link look byte-identical before and after a
   publish, so without a time there is no way for anyone (including us) to tell
   whether the file behind that button is the build just cut or last month's.
   "Did it actually publish?" is otherwise unanswerable from the page itself.
   Load the page after publishing and read the time back.

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
