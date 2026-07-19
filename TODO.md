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

`oursabeel.com` is a Google Workspace domain, so use the strongest setting:

- [ ] **OAuth consent screen → User type: `Internal`.** GCP Console → APIs &
      Services → OAuth consent screen. This makes Google itself refuse sign-in
      from outside the Workspace, before our code runs.
      With `Internal`, **no Google verification review is needed** and there's no
      unverified-app warning.
- [ ] Confirm scopes are only `email`, `profile`, `openid`. If you ever see a
      request for more, stop and tell Claude — nothing in this app needs it.
- [ ] If you ever switch this to `External`, **tell Claude** — the server-side
      domain check stays either way, but it changes the threat model.

> Needed at: Phase 13. Note the app's own admin-approval gate is separate and
> still applies to every `@oursabeel.com` account.

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

- [ ] Create a Sentry org/project set. Claude suggests **three projects** so
      errors don't get mixed: `kanban-web`, `kanban-android`, `kanban-functions`.
      (One project also works; say which you chose.)
- [ ] Client DSNs → put in `app/.env.local` (gitignored):
      `EXPO_PUBLIC_SENTRY_DSN=…`. **Do not paste it in chat.**
- [ ] Server DSN → run: `firebase functions:secrets:set SENTRY_DSN`
      (paste the value into that prompt, not into chat).

> Needed at: Phase 12. Safe to skip until then — the Sentry seams no-op without a DSN.

---

## F. Release build (before sharing an APK)

- [ ] **Generate a real release keystore** and store it somewhere you won't lose
      it — losing it means never being able to update the app. The debug key is
      only good for sideloading onto your own device.
- [ ] **Register the release SHA-1** on the Firebase Android app, then
      re-download `google-services.json` again.

> Needed at: Phase 13. Claude will give you the exact commands.

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

## Answered — kept for reference

- [x] **Sign-in domain is `oursabeel.com`**, a Google Workspace domain
      (confirmed 2026-07-19).
- [x] **No file attachments / no Cloud Storage** — decided 2026-07-19.
