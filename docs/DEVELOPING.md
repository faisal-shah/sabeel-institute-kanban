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

> You will see `dueSoonReminders: function ignored because the pubsub emulator
> does not exist or is not running`. That is expected: the daily due-soon sweep
> is a **scheduled** function, and scheduled functions do not run locally. Every
> other trigger — provisioning, comments, activity, notifications — does. To
> exercise the sweep, invoke it manually from the Functions emulator shell, or
> wait until it runs in production.

## Just use `scripts/dev.sh`

```sh
scripts/dev.sh status     # what is running, and which process owns each port
scripts/dev.sh stop       # free every port this project uses, and VERIFY
scripts/dev.sh web        # stop, start emulators + web, seed
scripts/dev.sh android    # stop, start emulators + Metro for the device build
scripts/dev.sh e2e        # stop, then run the full suite
```

Always `stop` before starting anything. A stale emulator or Metro holding a port
fails in ways that look like application bugs — `Could not start Authentication
Emulator, port taken`, or worse, a dev server that answers on 8086 while serving
code from a different checkout. `stop` re-checks the ports afterwards rather than
trusting that a kill worked, because a silently-failed kill is exactly how a
"cleared" port keeps serving yesterday's bundle.

### Debugging habits that keep paying off

- **`status` first, always.** Half a dozen sessions were lost to a process
  nobody knew was still running.
- **Never pipe a long-running command through `grep` to a log you intend to
  read while it runs.** grep buffers when its output is not a terminal, so the
  file stays empty and the run looks hung. Write the full output, then grep the
  file. (`grep --line-buffered` if you must filter live.)
- **Write logs to `/tmp/sk-*.log`, not the agent scratchpad** — the scratchpad
  gets cleaned mid-session and the evidence disappears with it.
- **Background jobs must outlive their launcher** (`nohup … & disown`), or they
  die with the shell and you debug a process that is not running.
- **Verify by using the app, not by reading coordinates.** A control can be
  on-screen and still unreachable. Type the comment and post it.
- **Re-test without touching anything.** If confirming a fix needs a scroll or a
  retry, your interaction may be producing the result rather than the fix.

**Terminal 2 — the app:**

```sh
npm run dev:web
```

Opens on http://localhost:8086.

**Terminal 3 — something to look at (optional):**

```sh
npm run seed
```

Creates three people, a board with eight columns and six cards by driving the
UI, so a seed that succeeds is also evidence the flow works. It is re-runnable:
each step is skipped if it has already happened.

The emulators start empty every time. To wipe them mid-session without a
restart:

```sh
curl -X DELETE "http://127.0.0.1:8080/emulator/v1/projects/demo-sabeel-kanban/databases/(default)/documents"
curl -X DELETE "http://127.0.0.1:9099/emulator/v1/projects/demo-sabeel-kanban/accounts"
```

## Android

Terminal 1 is the same (`npm run emulators`). Then:

```sh
scripts/emulator.sh headless     # boot the tb_emu AVD (or `window` to watch it)
npm run dev:android              # build, install, launch (~2 min the first time)
```

The AVD runs **headless** by default, so nothing appears on your desktop. Either
use `scripts/emulator.sh window` to watch it live, or take screenshots:
`scripts/emulator.sh shot my-screen` → `shots/my-screen.png`.

Already built once? Just restart Metro and relaunch, which is much faster:

```sh
cd app && EXPO_PUBLIC_USE_EMULATORS=1 npx expo start
adb shell monkey -p com.sabeelinstitute.kanban -c android.intent.category.LAUNCHER 1
```

**Web and Android share the emulator data.** Sign in as `faisal` on both and it
is the same account — approve once and both are in.

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

### Checking responsive layout

```sh
node scripts/device-shots.mjs      # real device profiles → shots/devices/
node scripts/responsive-shots.mjs  # four plain widths     → shots/responsive/
```

`device-shots.mjs` uses Playwright's maintained device descriptors (iPhone SE
through 14 Pro Max, Galaxy S9+/S24, iPad Mini/Pro, Galaxy Tab S4 — tablets in
both orientations) plus 1366/1920/2560 desktops. For each it asserts the
**expected layout actually rendered** (columns vs swipe, checked against the
breakpoint read from the source) and that there is **no horizontal overflow** —
the classic responsive failure a top-of-page screenshot would never reveal.

### Looking at EVERY screen (not just the board)

`device-shots.mjs` captures the boards list and the board. For a change that
touches every screen — a theme, a shared component, colours — that is not
enough: the bug is usually on a screen it never opens (an empty state, a form, a
card detail). Use the authenticated tour:

```sh
scripts/dev.sh web            # emulators + web + seed
node scripts/screen-tour.mjs  # signs in, walks Alerts / People / My work /
                              # board / Settings / a card, desktop + phone widths
                              # → shots/colors/
```

This exists because a colour change once shipped **blind** and had to be redone:
content text had drifted to `text.muted` (~2.7:1) and only the *rendered* screen
showed it — the token values were all correct. An unauthenticated screenshot
(the sign-in screen) proves nothing about the app.

**Native is a separate check** — web is not evidence about native rendering. To
look at the real Android app against seeded data:

```sh
npm run dev:android           # debug build, emulator-backed (dev sign-in row)
scripts/emulator.sh shot NAME
```

Two traps that cost time here: a debug build loads its JS **from Metro at
launch**, so `EXPO_PUBLIC_USE_EMULATORS` must be set when Metro starts and Metro
must be restarted with `--clear` after config changes; and `expo run:android`
printing BUILD SUCCESSFUL is **not** proof the APK installed (if the shared AVD
drops mid-run, a stale build stays on the device). Confirm with
`adb shell dumpsys package com.sabeelinstitute.kanban | grep versionName` before
trusting a native screenshot.

## A five-minute tour

With the emulators running and the app open:

1. Sign in as **faisal** → you land on "Waiting for approval".
2. In a terminal: `npm run grant-admin -- faisal@oursabeel.com`. **Watch the app
   un-gate by itself** — no reload, no sign-out.
3. **New board** → it starts with To Do / In Progress / Done.
4. Add a few cards. On web, drag them between columns. On Android, long-press a
   card for the "Move to…" sheet.
5. Tap a card for the detail screen: plain-text description, assignees, due date,
   priority, labels.
6. **Settings** on the board → add a column, add a label, add a member. Try
   deleting a column that still has cards; it refuses and says why.
7. Sign in as **sara** in a second browser (or private window), approve her under
   **People**, add her to the board, and assign her a card. Her view updates live.
8. **My work** → everything assigned to you across every board, overdue first.
9. Confirm the brand palette renders correctly (the app is light-only).

## Where things live

- `docs/PRODUCT_BRIEF.md` — decisions and data model. Start here.
- `docs/PHASE_STATUS.md` — what's built, what's next, exit criteria.
- `TODO.md` — the console work only you can do.
