# Sabeel Institute Kanban

Access-controlled kanban boards for Sabeel Institute — Android app and responsive
website from one Expo codebase, on a Firebase backend. Replaces ClickUp.

**Docs**
- `docs/BRAND.md` + `docs/brand/sabeel-color-usage-guide.jpg` — the official
  Sabeel Institute color guide. Consult before any design or color decision.
- `docs/PRODUCT_BRIEF.md` — decisions, data model, access rules. Source of truth.
- `docs/PHASE_STATUS.md` — the phase plan, exit criteria, and live build status.
- `docs/INHERITED-STACK.md` — what carries over from the sibling time-tracker
  project, and the traps it already paid for.
- `TODO.md` — console/account steps only Faisal can do.
- `CLAUDE.md` — working rules for the agent.

## Quick start

```sh
npm install                 # also builds @sabeel/shared

npm run lint
npm run typecheck
npm test                    # Vitest: shared + functions unit
npm run test:emulator       # Firestore rules tests (needs JDK 21)
```

**Web**

```sh
npm run web -w @sabeel/app          # dev server
npm run web:export -w @sabeel/app   # production bundle → app/dist-web
node scripts/web-shot.mjs           # screenshot light + dark → shots/
```

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
scripts/        emulator, test, screenshot and preflight helpers
docs/           product brief, phase plan, inherited-stack notes
```
