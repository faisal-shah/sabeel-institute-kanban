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

## A. GitHub — done

- [x] Private repo created and pushed (2026-07-19):
      https://github.com/faisal-shah/sabeel-institute-kanban
- [x] CI green on the Phase 0 commit.

---

## B. Firebase project

- [x] **Create the Firebase project.** Project id: **`sabeel-institute-kanban`**
      (already in `.firebaserc`). **Blaze (pay-as-you-go)** is required — Cloud
      Functions won't deploy on Spark.
- [x] **Create the Firestore database.** Location: **`nam5`** (multi-region US).
      Production mode; rules deploy from the repo and overwrite the console.
- [ ] **Do NOT enable Cloud Storage.** Attachments are deliberately out of scope.
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

v0.1.0 (2026-07-19) ships signed with the **debug keystore**, which is committed
to this repo. That was fine for getting a build onto your own phone, and it is
why the debug SHA-1 is the one registered in Firebase — but it means **anyone
with this repo can sign an update that Android will accept as this app.** Close
this before the APK goes to the team, not before "sharing" generally.

- [ ] **Generate a real release keystore** and store it where you will not lose
      it — losing it means never being able to update the app. Claude will give
      you the exact `keytool` command.
- [ ] **Register the release SHA-1** on the Firebase Android app, then
      **re-download `google-services.json`** (the re-download is what adds the
      OAuth client — see § D).
- [ ] Point `signingConfigs.release` at it in `app/android/app/build.gradle`,
      with the passwords in a **gitignored** `keystore.properties`, never in the
      gradle file.
- [ ] Re-cut the release. The debug-signed assets should come down once a
      properly signed build replaces them.

> Until this is done, treat v0.1.0 as internal-testing-only.

---

## G. ClickUp export — for the migration

- [ ] **Export the existing boards from ClickUp.** Try the CSV export first
      (Settings → Export). If it drops comments or assignees, an API token gets
      a fuller export — show Claude a small sample and it'll say which you need.
      → **Hand back:** the export file(s), placed in `migration/` (gitignored).
- [ ] **Sit down with Claude to reconcile `migration/mapping.json`.** ClickUp
      usernames → `@oursabeel.com` accounts, old list names → new board names,
      statuses → columns. This is genuinely fuzzy and needs your judgement —
      Claude proposes, you correct. Unmapped entries are hard errors, never
      silent drops.
- [ ] Review the **dry-run** output before authorising `--apply`.

> Needed at: Phase 14, after the production deploy and **before** the team is
> onboarded.

---

## H. Launch

- [ ] Decide who the **admins** are (they alone approve accounts and promote
      people) and who the **managers** are (they create boards and can join any
      board).
- [ ] You'll be bootstrapped as the first admin by a script after the first
      deploy; everyone else is promoted in-app.
- [ ] Confirm the **notification event list** in `docs/PRODUCT_BRIEF.md` before
      Phase 10 — it's the one thing Claude proposed rather than being told, and
      it governs how noisy the app feels.

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

## Answered — kept for reference

- [x] **Sign-in domain is `oursabeel.com`**, a Google Workspace domain
      (confirmed 2026-07-19).
- [x] **No file attachments / no Cloud Storage** — decided 2026-07-19.
