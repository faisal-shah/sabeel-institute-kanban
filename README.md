# Sabeel Institute Kanban

Access-controlled kanban boards for Sabeel Institute — Android app and responsive
website from one Expo codebase, on a Firebase backend. Replaces ClickUp.

**Docs**
- `docs/USER-MANUAL.md` — what the app does, for the people using it. Built to
  `docs/USER-MANUAL.pdf` with `docs/render-manual.py`; its screenshots come from
  `scripts/manual-shots.mjs`.
- `docs/PRODUCT_BRIEF.md` — decisions, data model, access rules. Source of truth.
- `docs/PHASE_STATUS.md` — the phase plan, exit criteria, live build status, and
  the **deploy log** (what shipped, when, and what it broke).
- `docs/DEVELOPING.md` — the dev loops: emulators, tests, screenshots, the screen
  sweep.
- `docs/DEPLOY.md` — deploying, the release APK, the public download page, rollback.
- `docs/BRAND.md` — the authority for Sabeel Institute colors (the designer's
  Option 1 palette, shared with the time-tracker; supersedes the archived
  `docs/brand/sabeel-color-usage-guide.jpg`). Consult before any design decision.
- `docs/INHERITED-STACK.md` — what carries over from the sibling time-tracker
  project, and the traps it already paid for.
- `docs/SECRETS.md` — which values are secret, and where each one lives.
- `docs/VERSIONING-RULE.md` — what a version means here and where it is enforced.
- `docs/MIGRATION.md` — the ClickUp import, done once.
- `docs/STACK-GOTCHAS.md` — a stub; the traps live in the `expo-firebase-stack`
  skill, which is public and shared with the sibling project.
- `TODO.md` — console/account steps only Faisal can do.
- `CLAUDE.md` — working rules for the agent.

## Quick start

```sh
npm install                 # also builds @sabeel/shared

npm run lint
npm run typecheck
npm test                    # Vitest: shared + functions unit
npm test -w @sabeel/app     # the app workspace's own unit tests
npm run test:emulator       # Firestore rules tests (needs JDK 21)
```

**End-to-end** (each starts its own emulators; all four run in CI)

```sh
bash scripts/e2e.sh scripts/web-e2e.mjs          # access + board flow
bash scripts/e2e.sh scripts/attachments-e2e.mjs  # files on cards
bash scripts/e2e.sh scripts/stats-e2e.mjs        # the chart, nine widths
bash scripts/e2e.sh scripts/screens-e2e.mjs      # every screen, five widths
```

**Web**

```sh
npm run dev:web                     # dev server against the EMULATORS  ← use this
npm run web:export -w @sabeel/app   # production bundle → app/dist-web
node scripts/web-shot.mjs           # screenshot the UI → shots/
```

> `npm run web -w @sabeel/app` starts the same server **without**
> `EXPO_PUBLIC_USE_EMULATORS=1`, which points it at **production Firebase** —
> real boards, real people. `npm run dev:web` (and `scripts/dev.sh web`) set the
> flag. Nothing in the UI announces which backend you are on, so prefer the
> wrappers.

**Android** (emulator only — there are no physical devices)

```sh
scripts/emulator.sh headless        # boot the tb_emu AVD
npm run android -w @sabeel/app      # build, install, launch
scripts/emulator.sh shot my-screen  # → shots/my-screen.png
```

> Metro port 8081 is shared with the other React Native projects on this machine.
> The emulator reaches Metro at `10.0.2.2:8081` directly, so `adb reverse` cannot
> redirect it. `scripts/preflight-metro.mjs` refuses to start if another
> project's Metro holds the port — otherwise you get a red screen quoting a
> different repo's paths after a successful build.

## Layout

```
app/            @sabeel/app — Expo + react-native-web (Android + web)
functions/      Cloud Functions (nodejs22, esbuild-bundled)
packages/shared @sabeel/shared — types, constants, cross-surface logic
scripts/        emulator, test, e2e, screenshot, migration and release helpers
docs/           manual, product brief, phase plan, deploy and brand guides
```

The app is a **single light theme — there is no dark mode** (decided
2026-07-21), and every colour goes through a semantic token; ESLint rejects a
hardcoded one. `app/src/theme/palette.ts` is the only exception, and is where
`docs/BRAND.md`'s palette lives.
