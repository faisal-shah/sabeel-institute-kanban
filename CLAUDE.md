# Sabeel Institute Kanban — Working Rules for Claude

## What this project is

A kanban board application for Sabeel Institute (small nonprofit, <50 internal
users), replacing ClickUp. Faisal is the developer; the nonprofit's staff are the
admins/managers in the app. Source of truth: `docs/PRODUCT_BRIEF.md` (decisions &
data model) and `docs/PHASE_STATUS.md` (live build status).

Key product invariants (do not silently change):
- **Restraint is the feature.** They left ClickUp because of interface bloat. No
  dashboards, integrations, automations, alternate board views, or time tracking.
  Every addition must justify itself against "does the team actually use this?" —
  when in doubt, leave it out and ask.
- **No board limit**, anywhere in the model, UI, or rules — the 5-board cap was a
  reason they're leaving.
- **Phone-first, not phone-compatible.** The mobile board is its own layout (one
  column at a time, swipe between columns), not a squeezed desktop board. Every
  feature ships with a phone design.
- **Three org-wide roles: admin / manager / member.** Managers create boards and
  may join any board; members see only boards they've been added to; admins alone
  approve accounts and promote people. There are NO per-board roles.
- **Sign-in is restricted to `@oursabeel.com` AND still needs admin approval.**
  The domain check is server-side — the client `hd` hint is UX, not a boundary.
- **No file attachments, no Cloud Storage.** Dropped deliberately; do not
  reintroduce a storage bucket without asking.
- **Descriptions are markdown in a native `TextInput`** — never a WebView
  rich-text editor. The research behind this is in the brief; don't redo it.
- **Assignees must be board members**, rules-enforced. This is what makes the
  cross-board "My Work" collection-group query legal without a parent lookup —
  breaking it breaks My Work's security model.
- **No WIP limits, no watchers, no card start dates.** All considered, all
  declined.
- **BRAND COLORS ARE FIXED.** `docs/brand/sabeel-color-usage-guide.jpg` is the
  official Sabeel Institute Brand & Website Color Usage Guide, and
  `docs/BRAND.md` restates it for code. **Consult both before ANY design or
  color decision** — new screens, components, illustrations, charts, anything.
  Warm Ivory (foundation) / Soft Sage (calm) / Dark Raspberry (brand identity,
  used with purpose) / Antique Gold (sparingly) / Mushroom Taupe (support).
- **All color goes through semantic theme tokens** from the first screen — light
  and dark ship together, following the OS. Never hardcode a color; the ESLint
  rule will reject it. `app/src/theme/palette.ts` is the only exception and is
  where the brand palette lives.
- **Boards archive, never hard-delete. Cards can be deleted, but only by
  managers/admins** — members archive.
- **Card ordering is fractional string ranks** in `@sabeel/shared`; a move is one
  document write. Never reintroduce an array-of-ids ordering.

`docs/STACK-GOTCHAS.md` collects the **stack-level** traps (Expo /
react-native-web / Firebase JS SDK) that keep getting rediscovered — auth in
in-app browsers, emulator project-id partitioning, stale Metro bundles,
unthemeable RNW controls, live-query empty-vs-absent. It is written symptom-first
and is intended to become a reusable skill: **when something in this stack costs
real time to diagnose, add the entry there**, not only in a commit message. It is
published as the `expo-firebase-stack` skill in `../agent-skills/`.

Its closing section, **"How this stack fools you"**, is the one to read before
debugging anything subtle here. The recurring shape is that failures imitate
success: APIs that run and do nothing (`Keyboard` events under edge-to-edge,
RNW's unthemeable `Switch`), verification steps that counterfeit the result (a
scroll during testing that looked like the fix working), a green web suite that
says nothing about a native layout bug, and resources that report "deployed"
while not working. **Prove the mechanism ran before concluding a fix was
insufficient, re-test without touching anything, and reproduce on the surface
that is actually broken.**

Sibling project `../sabeel-institute-time-tracker/` is the reference
implementation for every convention here — read its files directly rather than
trusting a summary when the details matter. `docs/INHERITED-STACK.md` records what
carries over and, more importantly, what was learned the hard way there.

## Stack (locked — mirrors the time tracker)

- One Expo codebase (`app/`): Android (local Gradle builds, committed `android/`,
  NO iOS, NO EAS) + web via react-native-web (`expo export --platform web` →
  Firebase Hosting). Platform seams as `.web.ts(x)` siblings.
- Firebase **JS SDK on all surfaces** (not react-native-firebase — no web support).
- Backend: Cloud Functions (TS, nodejs22, us-central1) + Firestore. **No Storage**
  (attachments are out of scope). Sentry on web/native/functions.
- Monorepo (npm workspaces): `app`, `functions`, `packages/shared`. Shared types
  and any cross-surface pure logic live in `@sabeel/shared` — the app and
  functions must never each hold their own copy of a rule.
- Google sign-in only, `@oursabeel.com` only; every new account lands `pending`;
  only admins approve/reject/disable users and change roles. Role and status live
  in **custom claims** (rules trust the token), mirrored onto the user doc for UI
  display only.
- Config-as-code: `firestore.rules` / `firestore.indexes.json` deploy from the
  repo, never console-edited.
- Versions to match at scaffold time: Expo ~57, RN 0.86, React 19.2, firebase ^12,
  firebase-functions ^7, TypeScript ~6.0, Vitest ^4, ESLint ^9 flat config, Node 22.

## Dev & test loops (to be scaffolded in Phase 0)

- Unit: `npm test` (Vitest: functions + shared).
- Rules/integration: `npm run test:emulator` (needs JDK 21; wraps
  `firebase emulators:exec --project demo-sabeel-kanban`).
- Android: `scripts/emulator.sh headless` (AVD `tb_emu`, Google-APIs image), then
  `npm run android -w @sabeel/app`. Firebase emulators from the AVD = `10.0.2.2`.
  There are NO physical devices — emulator only; verify UI by
  `scripts/emulator.sh shot NAME`.
- **Metro port 8081 is shared with the sibling RN projects on this machine**
  (time-tracker, PineTimeCompanion). The emulator reaches Metro at
  `10.0.2.2:8081` — the host directly — so `adb reverse` does NOT redirect it and
  the port cannot be moved without rebuilding the native app. Whoever holds 8081
  serves this app. `scripts/preflight-metro.mjs` (wired into `npm run
  android`/`start`) refuses to start when 8081 belongs to another project.
  Symptom if bypassed: a red screen quoting *another repo's* module paths after a
  perfectly successful build.
- Web screenshots: `node scripts/web-shot.mjs` after a web export — captures
  light and dark and fails on any page error.
- Web: `npx expo start --web` in `app/` (emulator-backed via env flag).
- CI (GitHub Actions): lint + typecheck + unit + emulator tests on every push.
  Keep it green. No deploys from CI.

**Verify UI changes by actually looking at a screenshot** (adb for Android,
Playwright for web) — never claim a screen works because the code looks right.

## Secrets (zero tolerance)

- NEVER ask for, accept, or echo real API keys/DSNs/tokens in chat; never hardcode
  them. Server secrets: output the exact `firebase functions:secrets:set NAME`
  command for Faisal to run.
- Client-side non-secrets (Firebase web config, `WEB_CLIENT_ID`) are committed;
  client DSNs go in gitignored `.env.local` (key names only in docs).

## Division of labor

- Agent: all code, rules, indexes, tests, emulator runs, CI, exact click-by-click
  console checklists, diagnosing pasted logs.
- Faisal only: third-party consoles (Firebase/GCP/Sentry), OAuth/SHA-1
  registration, anything with production secrets. He is already comfortable with
  all three consoles — give him precise steps, not tutorials. Everything Faisal
  must do himself is tracked in `TODO.md` — keep it current.

## Conventions

- Commit at phase boundaries (see `docs/PHASE_STATUS.md` once it exists); work
  autonomously within a phase.
- Before ANY significant install (global/system/major framework), ask first;
  routine project-local npm deps of the locked stack are fine.
- All repo artifacts (docs, plans, protocols) live in this repo.
- User-visible changes ship with their documentation in the same batch as the
  code — never let the manual lag a release.
- Live Firestore reads in `app/src` go through a single `useLiveQuery`/`useLiveDoc`
  module — never hand-roll `onSnapshot` state in a hook (lint-enforced). See
  `docs/INHERITED-STACK.md` for why this is non-negotiable.
