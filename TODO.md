# Faisal's setup checklist — things only you can do

Console, account and secret-handling steps Claude can't (or shouldn't) do.
Claude keeps this file current; you tick items off. Each item says **what to do**
and **what to hand back**.

**Nothing here blocks Phases 0–12** — everything runs against the Firebase
emulators until the production deploy at Phase 13. Do the Sentry and GitHub bits
whenever; leave the rest until Phase 12/13 if you like.

**Never paste a secret into chat.** Client Firebase config and the Web OAuth
client ID are *not* secrets and are committed. DSNs, service-account keys and
tokens are — they go in gitignored files or Secret Manager, and Claude only ever
tells you the command to run.

---

## Stats backfill — done

- [x] Re-ran `scripts/backfill-stats.mjs --write` on 29 July (2026) to fill the
      28 July hole left by `v0.5.0` deploying mid-afternoon. The dry run's
      self-check agreed with a direct count of the source documents before
      anything was written.

---

## A. GitHub — done

- [x] Repo created and pushed (2026-07-19):
      https://github.com/faisal-shah/sabeel-institute-kanban
- [x] **It is PUBLIC** (confirmed 2026-07-29). Audited on that date: no secret
      file, DSN, service-account key or token has ever been committed, in the
      working tree or anywhere in history; no ClickUp export; no APK or large
      blob; and none of the `@oursabeel.com` addresses in the repo is a real
      account — they are all fixtures. What IS committed is public by design:
      the Firebase web config, `google-services.json` and `firestore.rules`.
- [x] CI green on the Phase 0 commit.

---

## B. Firebase project

- [x] **Create the Firebase project.** Project id: **`sabeel-institute-kanban`**
      (already in `.firebaserc`). **Blaze (pay-as-you-go)** is required — Cloud
      Functions won't deploy on Spark.
- [x] **Create the Firestore database.** Location: **`nam5`** (multi-region US).
      Production mode; rules deploy from the repo and overwrite the console.
- [x] **Cloud Storage enabled** (2026-07-26, reversing the original decision).
      `firebasestorage.googleapis.com` on; bucket
      **`sabeel-institute-kanban.firebasestorage.app`** in **us-central1**
      (permanent, and one of the three regions with no-cost quotas);
      `roles/iam.serviceAccountTokenCreator` self-bound on
      `826656438175-compute@developer.gserviceaccount.com` so signed URLs can be
      minted. That grant fails ONLY in production — no local test can catch it.
- [x] **Billing budget alert set** (2026-07-27). Attachments are the first thing
      here with unbounded per-user cost, so this is worth having; it is done, and
      nothing needs to re-raise it. Note the billing account carries four
      projects, so a budget is only meaningful scoped to this one.
- [x] **Enable Google as the only sign-in provider.** Authentication → Sign-in
      method → Google → Enable. Leave every other provider disabled.
      The provider will not save until **Support email** is set — that is the
      only required field on that screen. The SHA-1 notice above it is advance
      warning about Android (§ D), not something that screen needs.
- [ ] **Set the public-facing name.** Same screen, currently the generated
      `project-8266…`. This is the name users see on the Google consent screen
      when they sign in, so make it **Sabeel Institute Kanban**.

> Needed at: Phase 13.

---

## C. Google Cloud — OAuth consent

**Decided 2026-07-19: External, published.** Not Internal.

- [x] **User type: `External`, publishing status `In production`.**
      Internal was the original plan and is the stronger setting — Google itself
      refuses non-Workspace accounts before our code runs. It turned out to be
      unavailable: **Internal requires the Cloud project to belong to a Google
      Cloud organization**, and the project is deliberately under a personal
      Google account, which has none. "Make internal" is greyed out for that
      reason, not because anything is misconfigured.
- [x] **Publish the app.** While status is `Testing`, ONLY explicitly-listed test
      users can sign in — staff would be locked out. Publishing is required, not
      optional.
- [ ] Confirm scopes are only `email`, `profile`, `openid`. If you ever see a
      request for more, stop and tell Claude — nothing in this app needs it.
      These are non-sensitive scopes, which is why no Google verification review
      and no 100-user cap apply.

**What this costs us, stated plainly.** The domain restriction now rests entirely
on the server-side check in `onUserCreate` (it deletes any auth user whose email
is unverified or not exactly `@oursabeel.com`). That check was always specified
to stand alone, and firestore.rules grant nothing without an admin-set
`status == 'active'` claim — so the window between a stray account being created
and deleted gives no data access. But the outer wall is gone: anyone with any
Google account can now reach the consent screen and briefly create an account.

**If Sabeel ever wants this properly:** move the project into an `oursabeel.com`
Cloud organization (keeps the project id and all data), then set Internal. That
also fixes the larger issue that the nonprofit's production system currently
lives in a personal Google account — a continuity risk independent of OAuth.

> Needed at: Phase 13. The app's own admin-approval gate is separate and still
> applies to every `@oursabeel.com` account.

---

## D. App registration

- [ ] **Register the Web app** in Firebase (Project settings → Your apps → Web).
      → **Hand back:** the config object. This is **not secret**; it gets
      committed to `app/src/firebase-config.ts`.
- [ ] **Register the Android app.** Package name: `com.sabeelinstitute.kanban`.
      → **Hand back:** `google-services.json` (save it to `app/`).
- [ ] **Add the debug SHA-1**, then **re-download `google-services.json`** — the
      re-download is what adds the Android OAuth client, and native Google
      Sign-In silently fails without it (that is the `DEVELOPER_ERROR` case).
      The debug fingerprint for this repo's committed debug keystore is:

      `5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25`

      Not a secret — it is the fingerprint of a debug key that is committed to
      the repo, and it only ever signs debug builds. Re-derive it any time with:

      ```sh
      keytool -list -v -keystore app/android/app/debug.keystore \
        -alias androiddebugkey -storepass android -keypass android
      ```

      The **release** build uses a different key, so its SHA-1 must be added too
      before sharing an APK (§ F).
- [ ] **Web OAuth client ID** — Claude reads it from `google-services.json`
      (the `client_type: 3` entry) and commits it as `WEB_CLIENT_ID`. Public, not
      secret. Nothing for you to do beyond the above.

> Needed at: Phase 13 (or earlier if you want to test real sign-in on a device).

---

## D2. iOS registration — **blocked on one console fix** (2026-08-01)

An iOS app was registered in the **right Firebase project**
(`sabeel-institute-kanban`) but with the **wrong bundle id**:
`com.sabeelinstitute.timetracker`, copied from a setup guide written for the time
tracker. Renaming the app in Firebase does not help — the nickname is cosmetic
and never appears in the plist, and **Firebase cannot change a bundle id after
creation**.

- [x] **Register a second iOS app** with bundle id `com.sabeelinstitute.kanban`
      (2026-08-01). `app/GoogleService-Info.plist` is committed — by design,
      exactly like `google-services.json`: client identifiers, not secrets.
      Verified a genuinely new registration (new `CLIENT_ID`,
      `REVERSED_CLIENT_ID` and `GOOGLE_APP_ID`), and `npm run check:ios` passes.
- [x] **Deleted the `com.sabeelinstitute.timetracker` iOS app** (2026-08-01).
- [x] **Registered the bundle id in the Apple Developer portal** and created the
      app in App Store Connect as `com.sabeelinstitute.kanban` (2026-08-01).
- [ ] **App ID capabilities: tick Push Notifications, and nothing else.** Not
      Background Modes (our pushes are alerts, not silent), not Associated
      Domains (no universal links), not Sign in with Apple (the enterprise-account
      exemption to guideline 4.8 applies). Reasoning in `docs/IOS-BUILD.md`.
- [ ] **APNs authentication key.** Apple Developer → Certificates, Identifiers &
      Profiles → **Keys** → new key with *Apple Push Notifications service (APNs)*
      enabled. Upload the `.p8` to Firebase → Project settings → Cloud Messaging →
      iOS app, along with its **Key ID** and your **Team ID**. **Without this,
      push does not work on iOS at all** — the app already uses push (§ I).
      **This is NOT the App Store Connect API key.** That one is a different `.p8`,
      made in App Store Connect → Users and Access → Integrations, and it uploads
      builds rather than delivering pushes. Both download exactly once and both
      are real secrets — keep either out of the repo.
- [ ] **Decide the distribution route** before submitting. Internal TestFlight
      needs no Beta App Review and fits a dozen colleagues; anything reviewed
      needs **working demo credentials** in the review notes, because sign-in is
      `@oursabeel.com`-only *and* admin-gated, so a reviewer cannot get in. See
      `docs/IOS-BUILD.md`.

Then, on the Mac: `npm run check:ios` must pass before building. It verifies the
bundle id, the Firebase project, the Google Sign-In URL scheme and the icon.
`docs/IOS-BUILD.md` is the runbook.

> Nothing here needs a code change from Claude — `app/app.json` is already wired.

---

## E. Sentry

- [x] **Three projects created** (2026-07-19), platform set to match the SDK:
      web → React, android → React Native, functions → Node.js. The platform
      choice only drives onboarding docs and defaults and is changeable later;
      the installed SDK is what determines behaviour.
- [x] **Client DSNs are in `app/.env.local`** (gitignored) as
      `EXPO_PUBLIC_SENTRY_DSN_WEB` and `EXPO_PUBLIC_SENTRY_DSN_NATIVE`.
      Two names, not one: web and native are separate projects, and a single
      shared variable would file Android crashes under the web project.
- [x] **`sabeel-kanban-functions` project created** (the UI stall cleared on a
      retry; it was never a plan limit — all Sentry plans include unlimited
      projects).
- [x] **Server DSN set + verified.** `firebase functions:secrets:set SENTRY_DSN`
      is done; the binding is live (every function deploy binds it), and the
      pipeline was confirmed end-to-end — the `functions-sentry-check` marker
      landed in the functions project 2026-07-20. The client paths were likewise
      verified via a deliberate-error test build.
- [x] **Rotation: decided AGAINST (2026-07-22).** A DSN is send-only — it cannot
      read Sentry or app data — so the only realistic risk is someone submitting
      noise events. For an internal app that is not worth the churn. Left as-is by
      choice. (To set it via the CLI if ever needed: `firebase functions:secrets:set
      SENTRY_DSN`, paste at the prompt, **never in chat**, then redeploy functions.)

**Do NOT run `npx @sentry/wizard`.** It rewrites committed native files and
metro config and writes a `sentry.properties` containing a real auth token. The
SDKs are wired by hand instead — see `docs/SECRETS.md`.

> Client DSNs are not secret (they ship in every bundle); the functions DSN and
> any auth token are. `docs/SECRETS.md` sets out which is which.

---

## F. Release signing — **a debug-signed APK is already published**

**Every release so far, up to and including v0.6.1, is signed with the debug
keystore**, which is committed to this repo. That is why the debug SHA-1 is the
one registered in Firebase — and it means **anyone with this repo can sign an
update that Android will accept as this app.**

The original note said to close this "before the APK goes to the team". It has
gone to the team; the app is in daily use. That does not make it urgent on its
own — the audience is a dozen colleagues who install deliberately — but the
condition it was written against has passed, so this is now a standing risk
rather than a pre-launch task. Swapping keystores also forces a **reinstall for
everyone** (Android refuses an update signed by a different key), which is the
real reason to plan it rather than slip it into a release.

- [x] **`build.gradle` is wired** (2026-08-02). `signingConfigs.release` reads a
      **gitignored** `app/android/keystore.properties`. With no such file the
      release build still works but is debug-signed and says so loudly, and
      `scripts/publish-apk.sh` now **refuses to publish a debug-signed APK** —
      verified by pointing it at the current one.
- [ ] **Generate the upload keystore.** Store it somewhere backed up and OUTSIDE
      the repo. Pick your own passwords; never paste them into chat or a file in
      this repo.

      ```sh
      keytool -genkeypair -v \
        -keystore ~/keys/sabeel-kanban-upload.jks \
        -alias upload -keyalg RSA -keysize 4096 \
        -validity 10000 -storetype PKCS12
      ```

- [ ] **Write `app/android/keystore.properties`** (gitignored):

      ```properties
      storeFile=/home/faisal/keys/sabeel-kanban-upload.jks
      storePassword=...
      keyAlias=upload
      keyPassword=...
      ```

- [ ] **Export the public certificate** — this is what Play Console asks for. It
      is a certificate, not a key; nothing secret leaves your machine.

      ```sh
      keytool -export -rfc -keystore ~/keys/sabeel-kanban-upload.jks \
        -alias upload -file upload_certificate.pem
      ```

- [ ] **Register the new SHA-1 in Firebase**, then **re-download
      `google-services.json`** — the re-download is what adds the OAuth client
      (§ D). Read it with:

      ```sh
      keytool -list -v -keystore ~/keys/sabeel-kanban-upload.jks -alias upload
      ```

- [ ] **If using Play App Signing, add Play's certificate SHA-1 too.** Google
      re-signs the app with an app signing key that is NOT your upload key, so
      the fingerprint that matters for Google Sign-In on a Play install is the
      one under Play Console → App integrity → *App signing key certificate*.
      Miss it and sign-in fails with `DEVELOPER_ERROR` for exactly the users who
      installed from Play, while your sideloaded build keeps working — so it
      looks like a device problem rather than a config one. Add **both**.

### Do these in order, next time you are at the computer

**Order matters.** Debug builds are broken until step 1b lands — the
google-services plugin fails outright with *"No matching client found for package
name"*. Everything up to that point is already committed and waiting.

1. **Firebase** → Project settings → **your existing Android app**
   (`com.sabeelinstitute.kanban`) → add SHA-1
   `33:93:4A:A4:5F:51:60:23:E3:86:6F:68:84:8A:20:2C:44:28:2E:97` (the upload
   key). The re-download below is what creates the OAuth client; without it
   sign-in fails with `DEVELOPER_ERROR`.
1b. **Firebase** → **Add app → Android**, package name
   **`com.sabeelinstitute.kanban.debug`**, and give it the DEBUG SHA-1
   `5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25`. This is the
   side-by-side dev build; it is a separate app to Android and to Firebase, but
   lives in the SAME project, so one `google-services.json` covers both.
1c. **Download `google-services.json` once**, after both of the above. It will
   contain **two** `client` entries. Put the same file in **both** places — they
   are byte-identical today and must stay so:
   - `app/google-services.json` (Expo's copy)
   - `app/android/app/google-services.json` (the one Gradle actually reads)

   Both are committed by design. Easiest over the GitHub web UI: open each file,
   "Edit", paste, commit — then tell me and I will pull and verify.
2. **Play Console → All apps → Create app.** It asks for an app NAME, not a
   package name — the package comes from the first AAB you upload. Take the
   default on Play App Signing (*let Google create and manage the app signing
   key*); your upload key is registered from that first bundle, so
   `~/keys/upload_certificate.pem` is usually not needed at all. Keep it only in
   case a screen explicitly asks for a certificate.

   **Android developer verification is a DIFFERENT screen** and not the way in.
   It links a package name to a signing key, and enforcement starts
   **30 September 2026** — after which unverified apps cannot be installed on
   certified devices, which is a hard expiry on the old sideloaded APK, not just
   a plan to retire it. Creating the app registers the package automatically, so
   leave any draft there alone rather than binding the package to the upload key
   by hand: what users install is signed with Google's app signing key, not that
   one.
3. **Build and upload:** `npm run build:aab`, then Play Console → Testing →
   Internal testing → Create new release.
4. **Firebase again, AFTER that first upload** → add the SHA-1 from Play Console
   → App integrity → *App signing key certificate*, and re-download
   `google-services.json` once more. This is the fingerprint Play-installed
   copies actually run under. Easy to skip, and the failure looks like a device
   problem: sign-in breaks only for people who installed from Play.
5. **Tell the team to uninstall and reinstall** from the Play invite. Android
   refuses an update signed by a different key, so there is no in-place upgrade
   from the old sideloaded build. Nothing is lost — all state is in Firestore.
   (This does NOT affect the `.debug` dev build, which is a separate app and can
   stay installed alongside.)
6. **Later, once everyone has moved:** remove the download section from the
   kanban page in the pages repo, and delete the `kanban-latest` release there.

> Decided 2026-08-02: Play is the Android channel from here on.
> `scripts/publish-apk.sh` is retired and refuses to run without
> `SK_LEGACY_APK_CHANNEL=1`; the frozen v0.7.4 download stays up until step 6.

### Notes on the Play move

- **`npm run build:aab` is the build.** It runs `bundleRelease` and repeats every
  gate publish-apk.sh used to hold — store-legal version, a deploy-log entry
  written *before* the build, and a signature that is not the debug key. The
  per-ABI splits switch themselves off for bundle tasks; leaving both on fails
  with *"Multiple shrunk-resources files found"*.
- **One channel, decided.** Play replaces the GitHub download. Keeping both was
  never really an option: Play signs installs with Google's app signing key and a
  sideloaded APK carries the upload key, so Android will not let either update
  the other. `scripts/publish-apk.sh` is retired accordingly.
- **Changing the signing key forces everyone to reinstall.** Android refuses an
  update signed by a different key, so there is no in-place upgrade from the old
  debug-signed build. Nothing is lost — all state is in Firestore — but it needs
  telling people, not discovering.
- **Target API level.** Play enforces a minimum `targetSdkVersion` for new apps
  and raises it annually; ours comes from `rootProject.ext.targetSdkVersion`
  (Expo's default for SDK 57). Check the current floor in the console before
  assuming it passes.

---

## G. ClickUp export — **done, one-time, 2026-07-26**

The migration ran and is finished. Nothing here is outstanding, and there is no
recurring import: it was a single pass, confirmed complete by Faisal.

Kept only as history — the importer (`scripts/import-clickup.mjs`) and the
`sourceId` field on cards are what it left behind, and both stay so a re-run
would update rather than duplicate.

## H. Launch — **done**

- [x] **Roles decided and in place.** Admins, managers and members are all
      assigned in production and the distribution was verified (2026-07-29).
- [x] **First admin bootstrapped** after the first deploy (2026-07-19); everyone
      since has been approved and promoted in-app.
- [x] **Notification event list confirmed** and shipped. `myCardMoved` is off by
      default because it fires constantly on a busy board — the reason the
      later "subscribe to a card" work was narrowed to comments only.

---

## I. Push notifications — two things only you can do

Android push is wired and ships in the next APK. Two items are console work.

- [ ] **Verify a push actually arrives.** Install the new APK, sign in, and let
      it ask for notification permission (Android 13+ prompts; if you dismissed
      it, Settings → Apps → Sabeel Kanban → Notifications). Then have the app
      notify you: from a second account, or the web app in a browser, `@`-mention
      yourself in a comment or assign yourself a card. The banner should arrive
      within a few seconds. An emulator cannot prove this — it needs the phone.
      If nothing arrives, say so and I'll read the function logs.

- [ ] **Web push — confirm the VAPID key is live** (was "generate a key"). A key
      is already present in `app/.env.local` as `EXPO_PUBLIC_FCM_VAPID_KEY` (added
      mid-session). What remains is to confirm it is the REAL key from the Firebase
      console (not a placeholder), that a web deploy since then carried it into the
      bundle, and that a web push actually arrives. The service worker half is
      written, committed, and verified to land at the site root on export.

      A VAPID key is a public/private pair identifying *your server* to the
      browser's push service (Google's for Chrome, Mozilla's for Firefox). The
      public half ships in the web app so a subscription is bound to you and
      cannot be replayed by anyone else; the private half stays in Firebase and
      signs each push. Android needs none of this because FCM reaches Play
      services on the device directly.

      Firebase console → **Project settings** → **Cloud Messaging** →
      *Web configuration* → **Web Push certificates** → **Generate key pair**.
      Copy the key into `app/.env.local` as `EXPO_PUBLIC_FCM_VAPID_KEY=…`. It is
      a public key, not a secret, but keep it out of chat by convention.

      Console-only — there is no `firebase` CLI command and no REST endpoint for
      it (checked, not assumed). Tell me when it's there and I'll rebuild and
      redeploy the web app. Until then web push does nothing, deliberately.

- [x] **Functions Sentry verified 2026-07-20.** Marker
      `functions-sentry-check 2026-07-20T16:01:17.471Z` arrived in
      `sabeel-kanban-functions`, environment `production`. The trace's second
      frame is `await fn(event)` — `guardedEvent` — so this also confirms the
      newly-wrapped background triggers deliver, not just the callables. All
      three surfaces now have an observed event, none inferred.

## J. Backups and disaster recovery

- [x] **Native protections enabled 2026-07-25** (you authorised me to run them).
      Before: PITR disabled, version retention **1 hour**, 0 schedules, 0 backups,
      delete protection off. Verified after, by reading the database back rather
      than trusting the success messages:

      | Setting | Value |
      |---|---|
      | `pointInTimeRecoveryEnablement` | `POINT_IN_TIME_RECOVERY_ENABLED` |
      | `versionRetentionPeriod` | `604800s` (7 days) |
      | `deleteProtectionState` | `DELETE_PROTECTION_ENABLED` |
      | backup schedule | daily, retention `8467200s` (98 days) |

      Both PITR and backup data are **excluded from the free tier** — expect a new
      (tiny) line item on the bill.

- [ ] **Confirm the first scheduled backup actually landed.** The schedule exists,
      but no backup is taken until it first fires (within 24h of 2026-07-25).
      `firebase firestore:backups:list` should show one — a schedule with no
      backup behind it is not yet protection. I'll check on the next session.

- [ ] **Rehearse a restore once, against a scratch database.** An unrehearsed
      restore path is a hope, not a plan, and the step that surprises people is
      that the destination id can *never* be the one the app is configured for.
      Walk the numbered procedure in `docs/DEPLOY.md`.

      This drill also settles the one open question in the Auth recovery story:
      whether a **Google sign-in attaches cleanly to a restored account** with a
      matching email and uid. If it does not, we add `firebase auth:export` as a
      belt-and-braces artifact; until then we are not guessing either way.

## Answered — kept for reference

- [x] **Sign-in domain is `oursabeel.com`**, a Google Workspace domain
      (confirmed 2026-07-19).
- [x] **File attachments** — declined 2026-07-19, **reversed 2026-07-26**.
      10 MB per file, any board member may remove, signed-URL downloads.
