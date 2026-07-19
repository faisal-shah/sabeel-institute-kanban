# Running the app locally

There is **no Firebase project yet** (that's Phase 13, `TODO.md`). Everything runs
against the Firebase emulators, which need no accounts, no keys and no network.

Prerequisites, all already present on this machine: Node 22+, JDK 21 at
`~/opt/jdk-21` (the emulators need it; JDK 17 stays the default for Gradle),
Android SDK at `~/opt/Android/Sdk` with the `tb_emu` AVD.

```sh
npm install     # once
```

## The quickest look: web

Two terminals.

**Terminal 1 — emulators** (Firestore, Auth, Functions):

```sh
npm run emulators
```

Leave it running. The Emulator UI is at http://127.0.0.1:4000 — useful for
inspecting Firestore documents and Auth users directly.

**Terminal 2 — the app:**

```sh
npm run dev:web
```

Opens on http://localhost:8086.

## Android

Terminal 1 is the same (`npm run emulators`). Then:

```sh
scripts/emulator.sh headless     # boot the tb_emu AVD (or `window` to watch it)
npm run dev:android              # build, install, launch
```

The app reaches the emulators at `10.0.2.2` automatically — that's the Android
emulator's alias for your machine, handled in `app/src/env.ts`.

Screenshot what you see: `scripts/emulator.sh shot my-screen` → `shots/`.

> **Metro port note.** Port 8081 is shared with your other React Native projects.
> The Android emulator reaches Metro at `10.0.2.2:8081` — your machine, directly —
> so `adb reverse` cannot redirect it. If another project's Metro holds 8081, this
> app silently loads *that project's bundle* and shows a confusing red screen.
> `npm run dev:android` refuses to start in that case and names the offending
> process.

## Signing in

There is no real Google sign-in yet — the OAuth clients don't exist until
`TODO.md` § D. Instead, dev builds pointed at the emulators show a **dev sign-in
row** with one-tap accounts:

| Button | What it demonstrates |
|---|---|
| `faisal`, `sara`, `omar` | Normal `@oursabeel.com` sign-ups. Each lands **pending**. |
| `intruder@gmail.com` | Outside the org domain — the server deletes it on sight. |

These go through the **real** Google provider path (the Auth emulator accepts a
fake Google token), so they exercise the same trigger, the same domain check and
the same approval flow as production will.

The dev row is gated on `__DEV__` **and** the emulator flag, so it cannot appear
in a release build — the e2e suite asserts its absence from the exported
production bundle on every run.

### Becoming an admin

Everyone starts pending, and only an admin can approve. To bootstrap yourself
the first time, with the emulators running:

```sh
npm run grant-admin -- faisal@oursabeel.com
```

Sign in as `faisal` first (so the account exists), then run that. **The app you
already have open will un-gate within a second** — no reload, no sign-out. That
live claim refresh is deliberate and worth watching.

From then on, approve everyone else in-app under **Manage people**.

> Emulator data is wiped when you stop the emulators, so you'll re-do this each
> session. That's intentional — a clean slate every time.

## Tests

```sh
npm run lint
npm run typecheck
npm test              # unit: shared + functions
npm run test:emulator # rules + real triggers/callables against the emulators
npm run e2e           # full browser flow: sign-in, approval, live un-gating
```

`npm run e2e` writes screenshots to `shots/`, and on failure dumps what each page
actually displayed — much faster than guessing.

## Where things live

- `docs/PRODUCT_BRIEF.md` — decisions and data model. Start here.
- `docs/PHASE_STATUS.md` — what's built, what's next, exit criteria.
- `TODO.md` — the console work only you can do.
