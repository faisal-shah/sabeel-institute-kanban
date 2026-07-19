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
firebase deploy --only firestore:rules,functions,hosting
```

Hosting serves `app/dist-web`, built automatically by the predeploy hook.

## First admin

Everyone lands `pending` and only an admin can approve, so the first admin has to
be made from outside the app. `scripts/grant-admin.mjs` does this with the Admin
SDK, but it needs gcloud ADC or `GOOGLE_APPLICATION_CREDENTIALS`:

```sh
GCLOUD_PROJECT=sabeel-institute-kanban node scripts/grant-admin.mjs you@oursabeel.com
```

**Without those credentials**, use the temporary one-shot instead
(`functions/src/bootstrap.ts`), which is how this project was bootstrapped on
2026-07-19:

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
3. Distribute via a GitHub release, never ad-hoc file sharing:
   `gh release create vX.Y.Z --notes "..." path/to/app.apk`

## Rollback

Hosting keeps previous releases — roll back from the console in one click.
Functions and rules do not: redeploy the previous commit. Firestore data has no
undo, which is why boards archive rather than delete and only managers can
permanently remove cards.
