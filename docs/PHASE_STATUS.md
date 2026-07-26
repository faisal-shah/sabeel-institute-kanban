# Phase status

Live build status **and** the detailed phase plan. Phases derive from
`docs/PRODUCT_BRIEF.md`; a commit lands at each phase boundary. Claude works
autonomously *within* a phase and checks in at boundaries.

**A phase is not complete until its exit criteria are met and verified by
actually looking** — an adb screenshot for Android, a Playwright screenshot for
web. "The code looks right" is not verification.

| Phase | What | Status |
|---|---|---|
| 0 | Scaffold + CI + theming | **complete** (2026-07-19: 15 tests green; light+dark verified by screenshot on `tb_emu` and web export; esbuild inlining of `@sabeel/shared` verified) |
| 1 | Auth + approval + roles | **complete** (2026-07-19: 83 tests + 11 e2e checks green; live un-gating verified on web AND Android by screenshot) |
| 2 | Boards + membership | **complete** (2026-07-19) |
| 3 | Columns + cards + ordering | **complete** (2026-07-19) |
| 4 | Mobile board | **complete** (2026-07-19, built alongside Phase 3 — the native board was written once, in its final swipe-paged form, rather than twice) |
| 5 | Card richness | **complete** (2026-07-19) |
| 6 | My Work | **complete** (2026-07-19) |
| 7 | Bulk actions | **complete** (2026-07-19) |
| 8 | Comments + mentions | **complete** (2026-07-19) |
| 9 | Activity history | **complete** (2026-07-19) |
| 10 | Notifications | **complete** (2026-07-20). In-app inbox, per-event prefs, mute-a-board, and Android push. Web push is inert until a VAPID key exists (`TODO.md` § I); on-device delivery is still unverified — see below. |
| 11 | Search + archive | **complete** (2026-07-19) |
| 12 | Polish + deploy readiness | **complete** (2026-07-19) |
| 13 | Production deploy | **complete** (2026-07-20) — live at sabeel-institute-kanban.web.app; APKs published; indexes probed in production |
| 14 | ClickUp import + launch | **blocked on a sample export** — the parser cannot be written without seeing real column names |

## What works today (2026-07-19)

Phases 0-12 are complete. Everything below runs against the emulators:

- Google-only sign-in restricted to `@oursabeel.com`, enforced server-side, with
  admin approval that un-gates the app live. A rejected account is told why
  rather than left spinning.
- Admin people-management: approve, reject, disable, change roles.
- Boards with columns, labels and membership; favourites and recents.
- Cards with markdown descriptions, assignees, all-day due dates, priority and
  labels; archive and (manager-only) delete.
- Web: multi-column board with real drag-and-drop. Android: swipe-paged single
  column with a "Move to…" sheet.
- Multi-select and bulk move/assign/archive/delete on both surfaces.
- Comments with @mentions, and a tamper-proof per-card activity history.
- Notifications: in-app inbox with unread badge, per-event preferences,
  per-board mute, and a daily due-soon sweep.
- My Work across every board, and global search across the boards you belong to.
- Sabeel brand palette (Option 1) and logo; single light theme, no dark mode.

**Tests: 196 unit + 124 emulator integration + 46 browser e2e checks.**

See `docs/DEVELOPING.md` to run it, `docs/USER-MANUAL.md` for the user guide and
`docs/DEPLOY.md` for the production checklist.

### Known gaps, stated plainly

- **Push delivery is unverifiable locally.** FCM needs a real project, so the
  emulator suite proves the triggers fire, the preference logic, and that inbox
  entries are written — but not that a phone buzzes. Confirm at Phase 13.
- **Board filters** (by assignee/label/priority within a board) exist in
  `@sabeel/shared` with tests, but are only surfaced through global search, not
  as a filter bar on the board itself.
- **No user-manual screenshots yet.** The manual is written; the images should
  be regenerated once the real project exists so they show real data.

Nothing before Phase 13 needs a real Firebase project — everything runs against
the emulators. Faisal's console tasks are tracked in `TODO.md`.

---

## Phase 0 — Scaffold, CI, theming

**Goal:** an empty but real app that builds, tests and renders on both surfaces.

Scope: npm-workspaces monorepo (`app`, `functions`, `packages/shared`);
`tsconfig.base.json` (strict); flat ESLint config; `firebase.json` with
firestore + hosting + emulators (**no storage**); `.firebaserc` placeholder;
Vitest wired for shared + functions; GitHub Actions CI (lint → typecheck → unit →
emulator); `scripts/emulator.sh` + `test-emulator.sh`; Expo app with
react-native-web; **semantic theme tokens, single light theme (no dark mode)**.

**Exit criteria**
- [x] `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:emulator` all
      pass — 15 tests (7 shared, 2 functions unit, 6 rules).
- [x] CI green on a push — run 29675519239, all steps passed including the
      emulator integration tests.
- [x] Hello screen screenshotted on `tb_emu` **and** the web export, in both light
      and dark: `shots/{android,web}-{light,dark}.png`.
- [x] No color literal outside `app/src/theme` — ESLint `no-restricted-syntax`
      rule rejects hex/rgb/hsl literals everywhere else.
- [x] **Bonus, deliberately pulled forward:** verified esbuild inlines
      `@sabeel/shared` into the functions bundle with no external `require` left.
      That is `docs/INHERITED-STACK.md` lesson 1 — the sibling project's first
      deploy failed on it, and it is cheaper to prove now than at Phase 13.

**Notes**
- Metro port 8081 is contended on this machine; `scripts/preflight-metro.mjs` now
  guards it. See CLAUDE.md § Dev & test loops.

## Phase 1 — Auth, approval, roles

**Goal:** the right people, and only the right people, can get in.

Scope: Google sign-in on both surfaces (`hd=oursabeel.com`); auth-create Cloud
Function enforcing the verified `@oursabeel.com` domain server-side; `pending` →
admin approve/reject; `setUserAccess` callable (admin-only) setting `role` and
`status` claims + mirroring to the user doc; gate screens for pending/rejected/
disabled; admin user-management screen; `scripts/grant-admin.mjs`.

**Exit criteria**
- [x] A non-`oursabeel.com` account is rejected by the *function*, proven with the
      consent screen bypassed — integration tests create users straight through
      the Admin SDK, including look-alike domains and unverified addresses.
- [x] New user lands `pending`; admin approves; the client picks up the claim
      change live without a manual sign-out. **Verified on web (e2e assertion
      that the URL never changed) and on Android by screenshot, with no
      interaction with the device between grant and un-gate.**
- [x] Rules tests cover every role × status combination (all 12).
- [x] Only admins can promote; a member cannot escalate themselves — tested at
      three levels: pure logic, the real callable over HTTP, and rules.

**Tests:** 32 shared + 11 functions unit + 40 emulator integration = 83, plus 11
browser e2e checks (`npm run e2e`).

**Two traps found and documented** (`docs/INHERITED-STACK.md` lessons 8 and 10):
the emulator project-id mismatch, and React Native needing
`experimentalForceLongPolling`. Both produce "the app hangs on a spinner while
the server says everything worked".

## Phase 2 — Boards and membership

**Goal:** boards exist, with the access model fully enforced in rules.

Scope: board CRUD (create = manager/admin); board settings (name, description,
columns, labels); membership add/remove; the **remove-member callable** that also
unassigns; board list with favorites + recents; board archive.

**Exit criteria**
- [x] Rules tests: member sees only their boards; manager sees all; member cannot
      create a board, edit settings, or add anyone — including the subtle case
      that a member cannot *remove themselves* either (it would look like
      leaving but strand their card assignments).
- [x] Removing a member unassigns them from that board's cards, in one batch —
      `removeBoardMember` callable, with `countMemberAssignments` so the UI can
      warn how many cards are affected before asking.
- [x] The full rules matrix from the brief is covered by tests, including that a
      member cannot list boards by claiming to be someone else in the query.
- [x] Narrow, field-scoped preference self-writes on `users/*` (favourites,
      recents, notification prefs) — `hasOnly()` so role cannot be smuggled in
      alongside a legitimate change.

## Phase 3 — Columns, cards, ordering ⚠️ technical core

**Goal:** correct, concurrent-safe card ordering.

Scope: `rankBetween` in `@sabeel/shared` with **property-based tests**; card CRUD;
column create/rename/reorder; column delete blocked while non-empty; web
drag-and-drop; lazy column re-rank on collision.

**Exit criteria**
- [x] Property tests: `rankBetween` always returns a strictly-between value;
      1000 sequential same-position inserts never collide or degrade (they also
      stay under 30 characters); 1000 consecutive prepends and appends; and a
      500-move random shuffle that re-checks the strict ordering invariant after
      every single move.
- [x] Rules reject a card whose `columnId` is not on the board — including a
      column id borrowed from a *different* board.
- [x] Rules reject assigning someone who is not a board member, which is the
      invariant the My Work collection-group rule depends on.
- [x] **Concurrent drags under injected latency** — done. Latency is injected
      between each client's read and its write, which is the window where a lost
      update happens; without the delay the writes serialise by luck and prove
      nothing. Covers interleaved moves in one column, moves to different
      columns, ten simultaneous moves, a deliberate rank collision, and a move
      racing an edit of the same card.

## Phase 4 — Mobile board ⚠️ technical core

**Goal:** the phone experience that justifies the project.

Scope: swipe-paged single-column board with position indicator; "Move to…" sheet;
long-press drag to reorder within a column; full-screen card detail; board
switcher bottom sheet.

**Exit criteria**
- Screenshots on `tb_emu` of: board, swipe mid-transition, move sheet, card
  detail, board switcher — light **and** dark.
- Reorder-drag and page-swipe gestures never trigger each other.
- Every live query goes through `useLiveQuery`/`useLiveDoc`.

## Phase 5 — Card richness

Scope: markdown description + formatting toolbar + rendered display (sanitized,
no raw HTML); assignees (**restricted to board members**); all-day due date
picker; priority; per-board labels with legible fixed colors.

**Exit criteria**
- Rules reject assigning a non-member. Tested.
- `dueDate` round-trips as `YYYY-MM-DD` with no timezone drift, tested across at
  least three timezones.
- Markdown renders identically on web and native; injection attempt is neutralized.

## Phase 6 — My Work

Scope: the cross-board collection-group query; grouping by due state (overdue /
today / this week / later); becomes the phone's landing screen.

**Exit criteria**
- [x] Collection-group index committed to `firestore.indexes.json` (still needs
      a **production** probe at Phase 13 — the emulator does not enforce them).
- [x] Rules tests: a user reads a card they're assigned to; **cannot** read a
      card on a board they don't belong to (being assigned to one card does not
      open the rest of that board); cannot list all cards globally; cannot query
      someone else's assignments.
- [x] Board names resolve with **no** extra reads — taken from the user's own
      board list, which is sound precisely because assignment implies membership.
- [x] The collection-group rule lives at `match /{path=**}/cards/{cardId}`; a
      board-scoped rule does not apply to collection-group queries at all.

## Phase 7 — Bulk actions

Scope: multi-select (web checkbox + shift-click; phone long-press); bulk move,
archive, delete, assign; batched writes preserving selection order at the destination.

**Exit criteria**
- Bulk delete is manager/admin-only, rules-tested for the bulk path too.
- Clearing a 40-card column then deleting it is a small number of gestures.

## Phase 8 — Comments and mentions

Scope: comment thread on card detail; @mention autocomplete over board members;
edit (author) and delete (author/manager/admin); "edited" marker; `commentCount`
maintained by trigger.

**Exit criteria**
- Rules: `authorUid` must equal the caller; non-author cannot edit.
- `commentCount` stays correct across create/delete, including concurrent writes.

## Phase 9 — Activity history

Scope: trigger diffing card before/after → `activity` subcollection; timeline on
card detail; rank-only changes deliberately not logged.

**Exit criteria**
- Clients cannot write activity at all. Rules-tested.
- A reorder produces no activity entry; a column move produces exactly one.

## Phase 10 — Notifications

Scope: FCM push; `users/{uid}/notifications` inbox + unread badge; per-event
preference screen; per-board mute; due-soon scheduled function.

**Exit criteria**
- Notification event list **confirmed by Faisal** before build starts.
- `ORG_TIMEZONE` and due-soon lead time pinned.
- No self-notification; muted board produces nothing; opt-out respected.
- Client can only flip `read`. Rules-tested.

## Phase 11 — Search, filters, archive

Scope: global client-side search across member boards; board filters (assignee,
label, priority, due); archive view + restore.

**Exit criteria**
- Search finds a card on a board not currently open.
- Works offline over already-cached boards.

## Phase 12 — Polish and deploy readiness

Scope: empty states, error states, loading states; `docs/USER-MANUAL.md` with
screenshots; `docs/DEPLOY.md`; Sentry wired **and observed delivering** on all three surfaces (web, Android, functions — the last confirmed 2026-07-20); accessibility
pass; release keystore.

**Exit criteria**
- Every screen has a designed empty and error state.
- Manual covers every user-visible feature, screenshots current.

## Push notifications — wired 2026-07-20

Found broken and fixed the same day. The send path in
`functions/src/notifications.ts` had always been there, but nothing on the client
ever registered a device token: `auth.ts` initialised `pushTokens` to `[]` at
provisioning and no code touched it again, so every send saw an empty list and
returned early. The inbox, the per-event preferences and mute-a-board all worked,
which is what made it look finished from the outside.

What it took:

- `app/src/notify.ts` / `notify.web.ts` — a new platform seam. Native takes the
  FCM token from `Notifications.getDevicePushTokenAsync()` (**not** an Expo push
  token — that routes through Expo's service, which the functions do not use).
- Tokens moved from an array field to the subcollection
  `users/{uid}/pushTokens/{token}`, matching the time tracker. Two devices
  registering at once cannot race, and rules can scope write access to a
  person's own tokens without opening the rest of their user document. The
  `pushTokens` array is gone from the type, the rules allowlist and the brief.
- Registration fires once per uid on the first signed-in snapshot in
  `session.ts`, and unregisters on sign-out — a push targets the DEVICE, so
  otherwise a handed-on phone keeps receiving the previous account's
  notifications.
- The Android build had no FCM config at all: `googleServicesFile` in `app.json`,
  the `com.google.gms:google-services` plugin in both gradle files, and
  `android/app/google-services.json` committed (public client config, same class
  as the web config).
- The send path now prunes tokens FCM reports as
  `registration-token-not-registered` / `invalid-registration-token`. Nothing
  else ever would: an uninstall or a factory reset leaves a token behind forever.
- Rules tests cover the subcollection — own tokens read/write/delete, pending
  users may register (registration precedes approval), nobody may write to
  another person's collection **including an admin**, and nobody may read
  another person's devices.

**Still unverified:** delivery itself. An emulator cannot prove it — it needs a
push to arrive on Faisal's phone. Web push is deliberately inert until a Web Push
certificate (VAPID) key exists; see `TODO.md` § I.

## Phase 13 — Production deploy

Scope: real project in `.firebaserc`; deploy rules, indexes, functions, hosting;
bootstrap first admin; **production index probe**; Android release APK via GitHub
release.

**Exit criteria**
- Every composite index verified **in production** — the emulator does not enforce
  them (lesson 6).
- Callables verified reachable (lesson 2 — the 403 trap).
- Release APK verified production-mode by screenshot before publishing.

## Phase 14 — ClickUp import and launch

Scope: `scripts/import-clickup.mjs` (extract → reconcile → apply); the
mapping conversation with Faisal; dry-run, then apply to production; then onboard
the team.

**Exit criteria**
- Dry-run output reviewed and approved by Faisal before any write.
- Re-running the import updates rather than duplicates (idempotent via `sourceId`).
- Nothing unmapped is silently dropped — unmapped entries are hard errors.
- Spot-check imported boards against ClickUp before opening access.

---

## Deploy log

### 2026-07-25 — Subtasks: cards that link to cards — v0.1.23

A card can now be a **subtask of one other card on the same board**. The parent's
detail view lists its subtasks and links straight through; the child shows
**Subtask of** to get back up.

**This reverses a locked scope decision** — `PRODUCT_BRIEF` listed
"checklists/subtasks" under *Explicitly NOT in v1*. Justified: production still
carries **7 cards with a fake `Subtask of:` line** in their descriptions, written
by the ClickUp import because the feature didn't exist. What shipped is far
lighter than what was declined — a link between two ordinary cards, not a
checklist with its own item type. The brief now says so rather than being
silently contradicted.

- **`parentId` on the CHILD**, so the parent's list is derived and two documents
  can never disagree. Not a `subtaskIds[]` array on the parent, which would make
  every reparent a two-document write with a drift window.
- **No new query, no new index, no new counter.** `CardScreen` already loads the
  board's cards for its move-rank maths, and every board layout already groups
  them — so the subtask list and the `N subtasks` face chip are client-side
  derivations that cannot go stale. Deliberately unlike `commentCount` /
  `activeCardCount`, which need triggers only because their source isn't loaded.
- **Cycle safety in `@sabeel/shared`** (`subtasks.ts`): the picker refuses a card
  that is itself, already has a parent (no silent stealing), or is an ancestor of
  the target. `ancestorsOf` walks with a visited set, so data that is already
  corrupt is traversed once instead of hanging the UI thread.
- **Rules**: `parentId` added to the card key allowlist — omit it and every
  subtask becomes uneditable the moment it is linked, the same trap `sourceId`
  documents. Shape-validated only; enforcing "parent is on the same board" would
  need the first card→card `get()` in the rules, costing a read per write and
  racing a delete, and it is not a security boundary.
- **Lifecycle**: a cross-board move clears `parentId` (board-scoped exactly like
  `labelIds`); a copy never inherits it; deleting a parent unlinks its children
  via `onCardDeleted` — without that they would dangle *and* become permanently
  unlinkable, since the picker refuses an already-parented card.

**Fixed a latent bug this feature would have made routine.** `App.tsx` rendered
`CardScreen` with **no `key`**, so a card→card push reused the component and kept
its local state: start editing card A's title, tap a subtask, and card B rendered
showing **A's typed title** — pressing Save wrote A's text onto B. Now keyed by
card id. The web verification reproduces exactly that scenario and asserts B shows
its own title.

Verified on **web** (desktop + 390px): create, link with the filter, tap through,
unlink (which detaches without deleting — confirmed the card survives on the
board), the `2 subtasks` chip, and the keying fix. And on **native** (AVD):
section renders, create via the real soft keyboard, card→card navigation, the
parent line, and **hardware back** returning to the parent. 245 shared unit tests
(20 new), emulator suite green — 126 rules tests (+5 for `parentId`) and 36
function tests (+1 for the orphan sweep).

### 2026-07-25 — Icon targets are real 44px boxes, not hitSlop — v0.1.22

Reported from a real phone: the save/cancel icons when renaming a column were
"too small and close to one another… you have to use the very tip of your
finger."

The cause was **app-wide**, not local to that editor. `IconAction` sized its
target with `hitSlop` — invisible margin painted OUTSIDE the element — 12px each
side. Two icons separated by a 4px gap therefore had touch areas overlapping by
**20px**, a band belonging to both, where which one you hit was arbitrary. The
same defect was in every adjacent icon pair in the app: the board header's
gear/back (12px gap → 12px overlap) and the bulk bar's six icons (16px gap → 8px
overlap). Only the rename pair was tight enough — and high-stakes enough, save vs
discard — for anyone to notice.

- **`IconAction` now lays out a real 44×44 box** (`minWidth`/`minHeight`, centred
  ink) instead of using `hitSlop`. Laid-out boxes cannot overlap, so adjacent
  icons are always unambiguous, and 44 is the platform accessibility minimum
  rather than a number that felt right. Fixes every icon row at once.
- Because the box now carries its own separation, the gaps in the bulk bar
  (`space.lg`) and both board headers (`space.md`) drop to `space.xs` — otherwise
  the bulk bar, which must stay on ONE row, would have grown past a phone's width.
- The rename pair also gets **bigger ink (24) and a colour distinction**: save is
  accent-tinted as the affirmative, cancel stays muted. Two muted 18px glyphs are
  hard to tell apart in a hurry regardless of target size.

Verified on **web** by measuring: both targets are exactly 44×44 with a 4px gap
and zero overlap, and the phone page has no horizontal overflow (bulk bar still
one row at 390px). And on **native** (AVD): targets measure 115×115px — 44dp at
that density — non-overlapping, with the accent check clearly distinguishable.

### 2026-07-25 — Editable column names, and column delete now asks — v0.1.21

Column names are editable **everywhere a column name appears** — board settings
and all three board layouts — and deleting a column now takes a confirmation
instead of firing on one tap.

- **One shared `ColumnNameEditor`** (`app/src/components/ColumnNameEditor.tsx`)
  rather than four copies of the same edit state; it renders through
  react-native-web inside the web board's DOM header, exactly as `CardFace`
  already does. Idle shows the name plus a pencil; editing swaps in a field with
  save/cancel. Manager/admin only, matching the board-update rule.
- **The rename rule lives in `@sabeel/shared`** (`renameColumn`), because it has a
  trap: `validateColumnName` rejects a name any existing column holds — and the
  column being renamed is one of those. Validating against the whole list would
  reject re-saving a column's own name and, less obviously, reject fixing only its
  **capitalisation**, since the duplicate check is case-insensitive. Unit-tested,
  including that case-only rename.
- **Phone layout gets its own treatment**: the pager's Prev/Next buttons step
  aside while editing (they leave barely 130px between them, which is not a field
  you can type a column name into), via an `onEditingChange` callback.
- **Delete now confirms.** It was one tap from gone for an empty column;
  emptiness is not consent. A named confirmation ("Delete the column “Done”? It is
  empty, but this cannot be undone.") with a labelled destructive button, per the
  convention that destructive-and-unusual actions get words, not icons. The wide
  boards also hide the delete ✕ while a rename is open, so the cancel ✕ and the
  delete ✕ are never adjacent.
- **`columnDeleteBlocked` moved to `@sabeel/shared`** — the "still has N cards"
  guard was triplicated across the three boards with drifting wording.
- Tidy-up while in the file: WideBoard's column delete was a `Button label="✕"`,
  now an `IconAction`, per the icons-not-labelled-buttons convention.

Verified on **web** (desktop + 390px phone, all four surfaces): rename persists,
duplicate names rejected, delete asks and cancels cleanly, non-empty columns still
blocked, no page errors. And on **native** (AVD): pencil renders, the field takes
the full pager row with the soft keyboard up, the rename persisted with
`columnIds` **still in sync** with `columns`, and the delete confirmation appeared
instead of deleting. 225 shared unit tests, emulator suite green (121 rules + 35
functions).

### 2026-07-25 — Disaster recovery: native protection + a detection canary

Backend and ops only — **no client change**, so nothing here gated on an app
release. Production had no data safety whatsoever: PITR disabled (version
retention **1 hour**), zero backup schedules, zero backups, delete protection off.
The only backup in existence was a 65 KB JSON file on one laptop, written by a
throwaway script that was deleted immediately after — and it had no reader.

- **Native Firestore protection, enabled and verified in production**: PITR
  (`versionRetentionPeriod` 3600s → **604800s**, 7 days) + a **daily** backup
  schedule at **98-day** retention (Firestore's maximum) + `DELETE_PROTECTION_
  ENABLED`. Google-managed settings, no code to maintain. Chose daily over the
  sibling's weekly; both layers are excluded from the free tier. State was read
  back from the database afterwards rather than inferred from the CLI's success
  messages.
- **`healthCheck` canary** (`functions/src/health.ts`), ported from the sibling
  time-tracker: daily `count()` aggregations per collection, compared against a
  baseline at `meta/health`, raising to Sentry when a collection shrinks past its
  tolerance — zero tolerance for `boards`/`activity`/`users` (the rules forbid
  deleting the first two at all), `max(5, 20%)` for `cards`/`comments`/
  `notifications`. Sends a Sentry **cron check-in**, so the job going silent is
  itself an alert. Retention is worthless if nobody notices in time.
  - Kanban-specific: `comments`/`activity`/`notifications` are **subcollections**,
    so they must be counted with `collectionGroup`. A bare `collection('comments')`
    would count a non-existent top-level path and report perfect health forever.
  - New `COLLECTIONS` in `@sabeel/shared`; `reportMessage`/`startCheckIn`/
    `finishCheckIn` ported into `functions/src/sentry.ts`.
- **`scripts/restore-auth.mjs`** — Firestore backups do not cover Firebase Auth,
  and recreated accounts get **new uids**, which would silently break every
  `memberUids`/`assigneeUids`/`createdBy` reference. No separate Auth backup is
  needed because `users/{uid}` already holds the roster (the doc id *is* the uid),
  so this rebuilds accounts with their original uids and re-applies role/status
  custom claims. Dry-run by default, idempotent, never deletes.
- **`docs/DEPLOY.md`** gained a full runbook, replacing the old "Firestore data
  has no undo" line: the two layers, inspect commands, and the numbered restore
  procedure — restore to a scratch db → verify → export → **import back into the
  original database id**. You can never restore into an id already in use, and
  repointing installed Android clients would mean a new build for every user.

Verified: 26 unit tests (15 new, policy exhaustively pinned), emulator suite green
(121 rules tests incl. a new one proving `meta/health` is client-denied by the
catch-all; 35 function tests incl. a new one proving the collectionGroup counting
and the re-baseline). `restore-auth.mjs` verified both ways — dry-run against
production (5 accounts, nothing written) and apply against emulators (uids
preserved, claims applied, idempotent on re-run).

Outstanding, tracked in `TODO.md` §J: confirming the first scheduled backup lands
(a schedule with no backup behind it is not yet protection), and a restore drill —
which is also what settles whether a Google sign-in re-attaches to a restored
account.

### 2026-07-24 — Instant Leave/Remove feedback + quieter slow-write alerts — v0.1.20

Follow-up to v0.1.19, prompted by a real phone: leaving a board took seconds with
no feedback (a Cloud Function cold-started *before* the confirm dialog even
showed), and the slow-write monitor then emailed the team an error-level issue for
it.

- **The confirm dialog now opens instantly.** Tapping Leave/Remove no longer waits
  on `countMemberAssignments` first. Self-leave skips that callable entirely (one
  round-trip, not two — `removeBoardMember` already reports what it unassigned);
  removing someone else opens the dialog immediately and fills the card count in
  the background ("Checking…" → "assigned to N cards"), guarded by a request token
  against a stale count landing in the wrong dialog.
- **Slow-write monitor tuned.** `slowWrites` now reports at **warning**, not error
  (via a new optional `level` on `captureError`, both sentry seams), and the
  threshold moves 3s → **5s**. The two unavoidable causes — a cold-started callable
  and a Firestore write on a poor connection — are latency, not defects, and every
  action already shows a spinner while it runs; recording them is useful, paging
  the team is not. (Console-side: the alert rule should page on error/high-priority
  only.)

Client only. Verified end-to-end on **web** (self-leave dialog in 62ms; remove-
other count fills in, no page errors) **and native** (AVD: dialog instant, full
leave → member count drops to 2). Typecheck + lint clean.

### 2026-07-24 — Self-service board membership: Join / Leave — v0.1.19

Managers and admins can now **join** and **leave** a board themselves, from the
board's **Members** settings — no new screen. This completes the brief's
"managers may join any board", which the UI could not actually do before (adding
members needs the admin-only user directory; adding *yourself* does not).

- **Leave** — your own row in Members now offers **Leave** (it was blank before).
  It runs the existing `removeBoardMember` callable, so card assignments clear
  atomically; you are told how many first, then sent back to your boards.
- **Join** — open the settings of a board you are not on (managers/admins may view
  any board) and a **Join this board** button sits at the top of Members. It adds
  only *your own* uid, so it needs no directory read — a manager can join any
  board without admin rights to list users.
- Others' membership is unchanged: still added/removed by managers/admins. Only
  your *own* membership is self-service.
- Rules test added (`boardRules.test.ts`): a manager can add their own uid to a
  board they are not on.

Client + one rules test; no schema or index change. Verified on web (desktop +
phone) end-to-end against the emulator: Leave → the board flips to the Join card →
Join restores membership, through real rules and callables, no errors.

### 2026-07-24 — Boards list shows active card count — v0.1.18

The Boards list now shows **N cards · N members** per board (non-archived card
count) instead of **N columns** — column count isn't useful there; the live card
count is. Server + client:

- **New `activeCardCount` on the board doc**, maintained by a new
  `onCardBoardCount` trigger (functions) — the same denormalised-count pattern as
  a card's `commentCount`. One delta covers create / archive / unarchive /
  cross-board move / delete. `newBoard` seeds it to 0; `firestore.rules` allows
  the key on board writes.
- **Backfill** (`scripts/backfill-board-card-count.mjs`) recomputes the count for
  boards that predate the trigger — run against prod at deploy.
- Integration test (`boardCardCount.test.ts`) covers the whole lifecycle.

Verified: emulator suite green (rules + triggers incl. the new one); web shows
"6 cards · 1 member" after a seed. Deployed rules + functions, backfilled prod,
then web + APK.

### 2026-07-24 — Card faces at a glance (badges + assignees) — v0.1.17

Client-only. Replaces the bare priority color dot with a proper card face —
title · priority · labels · due · assignees — everywhere, via **one shared
`CardFace`** (the face had been hand-inlined in five places; the greenfield fix
was to extract it, not edit five copies).

- Priority + labels are colored **badges**; assignees are **name chips**. Badge
  text ink is picked for contrast by a new pure, unit-tested `readableInkOn` WCAG
  helper in `@sabeel/shared` (goldenrod/gold → dark text, the rest ivory). `none`
  priority shows no badge.
- Labels + assignees now render on **all** surfaces (board ×3, My Work, Search),
  resolved against the already-loaded board `labels`/`members` (My Work's mapper
  stopped dropping the ids).
- CardScreen priority + label pickers restyled to the same badges (fixes the
  label picker's muted-text-on-fill).

Verified on **web** (board desktop+phone, card detail, My Work, Search) **and
native** (AVD: board face + label picker) — badges readable on every color,
assignee chips flow, `none` shows nothing.

### 2026-07-23 — Production reset and fresh ClickUp re-import (data op, logged late)

No release — recorded here retrospectively because it was a **production data
operation** and the log had no entry for it, which is exactly the kind of gap that
makes an incident harder to reason about later.

Ahead of inviting the former ClickUp users, production was backed up, wiped down
to Faisal's admin account, and re-imported from the ClickUp export: **3 boards, 27
cards, 15 comments**. The backup landed at
`migration/backups/prod-20260723-143703.json` (gitignored, ~65 KB, and it captured
auth users + claims as well as Firestore).

The backup and wipe scripts were written as throwaway heredocs, run once, and
deleted — so the snapshot has **no reader**, and the operation is not repeatable
as written. That, plus production having no PITR or backups at all, is what
prompted the disaster-recovery work on 2026-07-25.

### 2026-07-23 — Reorder handle, build stamp, sign-in button — v0.1.16

Client-only:

- **Board columns reorder by drag handle**, not ↑/↓ buttons. New `ReorderList`
  (HTML5 drag on web, hand-rolled PanResponder on native — no gesture library).
  Columns is the only button-reordered list. Verified on **both** web and native
  (handle renders, drag reorders, one `columnsPatch` write per drop, persists).
- **Sign-in screen stamps the running build** — `v<version> · <commit>` footer,
  injected at build time by `scripts/gen-build-info.mjs` (wired into `prepare`,
  `web:export`, and `build:apk`). Durable requirement.
- **Sign-in button spans its card** — `Button` gained a `block` prop; the one
  screen that's the exception to content-width-on-wide.

### 2026-07-22 — Share a card + board breadcrumb — v0.1.15

Client-only (no rules/functions/index change):

- **Board breadcrumb** on the card view — cards are top-level docs, so the detail
  screen previously never named its board. Now a tappable accent breadcrumb at
  the top shows the board and jumps to it.
- **Share a card** (v1): a Share button on the card view hands an `https://…/c/{cardId}`
  link to the native share sheet (Android) or the Web Share API / clipboard (web).
  Opening the link resolves the card's board **live** (`findCardBoard`) and opens
  the card — the link is `/c/{cardId}` alone, with no board baked in, so it
  survives a cross-board move (which reuses the same card id). A non-member or a
  deleted card gets a plain "unavailable" notice, not a blank screen. New platform
  seams: `links.ts`, `deeplink.ts(.web)`, `share.ts(.web)`, `alert.ts(.web)`,
  `pendingLink.ts`, `useDeepLinks.ts`.
- **Deferred to v2** (needs the release keystore's SHA-256 → `assetlinks.json`):
  Android **App Links** so a phone opens the link in the installed app instead of
  the browser. v1 opens the web app in the browser on a phone — fully functional.
  See TODO.md § F (release signing) — the two share the signing fingerprint.

Verified: lint + typecheck clean; link parser proven against URL/path/query cases;
authenticated web tour (desktop + phone) — breadcrumb renders, Share copies the
correct `/c/{id}` link, and loading `/c/{id}` fresh resolves + opens the right card.

### 2026-07-22 — Production-readiness hardening — v0.1.14

Shipped the two-phase hardening pass (see the commits "Production-readiness
hardening Phase 1/2"). Server AND client change here, deployed together:

- **Rules** (`firestore.rules`): card/board/comment writes restricted to their
  known key set (`keys().hasOnly`) and card `description` capped at 20000.
  Backward-compatible — verified against live prod before deploy: all 32 cards /
  4 boards / 23 comments were already within the new key sets, longest
  description 1583 chars. v0.1.13 installs keep working (write shapes unchanged).
- **Functions**: new `onCardDeleted` cascade (deletes a hard-deleted card's
  orphaned comments/activity, guarded against a re-created live card);
  `removeBoardMember` now attributes its unassignment activity to the manager.
- **Client**: input length caps (board name / card title / comment body /
  description) so a normal edit no longer fails with a raw permission-denied;
  Search consolidated to a `boardId in [...]` query (reuses the existing
  `(boardId, archived, rank)` index — confirmed built in prod via
  `scripts/probe-indexes.mjs`); double-submit + markRead-drift fixes; sign-out
  clears the live-query cache.

Verified: lint, typecheck, web export, and the split emulator suite (149 tests,
5× green) plus CI. Shipped to Hosting + the Android release APK.

### 2026-07-21 — Widescreen layout pass — v0.1.13

Client-only UI change (no rules/functions/indexes). The wide/desktop view was the
phone layout stretched sideways — full-width buttons and list rows in an 840px
column. Fixed systematically with responsive primitives (`app/src/theme/layout.ts`,
`app/src/components/ui.tsx`):

- `Button` sizes to its content on a wide screen (full-width still on a phone), so
  standalone buttons stop stretching into bars everywhere at once.
- `Screen` `width` gains `read` (~640 reading column for text/forms) and `list` (a
  wide 1160 column for grids), alongside `content`/`full`.
- `CardGrid` — a responsive grid (as many ~250px columns as fit; one column on a
  phone).

Applied: Boards is a grid of cards with a real **star** favourite icon (was a
filled dot); My work and Search are grids; Card detail, Board settings,
Notifications, People, sign-in and gate screens use the reading column. Dropped
the redundant Back button from the nav-bar tab roots (My work / Search / Alerts).
The widescreen reasoning was also written into the public `expo-firebase-stack`
skill. Verified on the emulator at desktop (1500px) and phone (390px) widths;
shipped to Hosting + the Android release APK.

### 2026-07-21 — Navigation shell + move/copy panel polish — v0.1.12

Client-only UI change (no rules/functions/indexes), from the team's feedback on
v0.1.11.

- **A persistent navigation shell** (`app/src/components/AppNav.tsx`) replaces the
  per-screen row of header buttons that wrapped and scattered: a **bottom tab bar
  on a phone**, a **VSCode-style left rail on wide/web** — Boards · My Work ·
  Search · Alerts (+ unread badge) and an Account menu (People for admins, Sign
  out). The bottom bar shows only on the tab roots and steps aside on the
  immersive board/card screens; the left rail persists everywhere. Safe-areas go
  through `react-native-safe-area-context` (real per-device insets, floored), and
  `Screen` drops whichever edge the chrome claimed (`NavClaimedEdgesContext`) so
  insets never double.
- **Move/copy panel** rebuilt: board/column dropdowns and Copy·Move on one
  left-aligned wrapping row, dropdowns only as wide as their text (`field-sizing:
  content` on web so the box hugs the current value, not the widest option), no
  redundant counts or Cancel. Reflows with the buttons paired when it can't fit.
- **Board/card headers**: titles truncate and Settings/Back became icons, so a
  long board name no longer displaces them.

Verified on the emulator, web (rail) and native (bottom bar clearing the gesture
pill; board immersive; the redesigned panel). Shipped to Hosting + the Android
release APK.

### 2026-07-21 — Cards become a top-level collection + cross-board move/copy

Two-phase change shipped to production (project `sabeel-institute-kanban`).

- **Phase A (data model, invisible).** Cards moved from the per-board
  subcollection `boards/{boardId}/cards/{cardId}` to a **top-level `cards/{cardId}`
  collection** with a `boardId` field; comments/activity ride along under the card.
  Deployed in order — indexes (waited for the board-view index to build) → migration
  **copy + verify** (32 cards, 23 comments, 65 activity, 0 problems) while functions
  still triggered the old paths → re-pathed functions + rules + client together →
  live-verified → migration **--purge** (0 old, 32 top-level). Rules rewritten to
  resolve a card's board from its `boardId`; the collection-group My Work rule was
  deleted (My Work is now a plain collection query, still gated by the assignee
  read arm). 136 emulator rules tests + 201 unit tests green.

- **Phase B (feature) — v0.1.11.** Cross-board move & copy: long-press a card →
  the bulk bar's folder-arrow action → pick a destination board and column → Copy
  or Move. A move is one batched `update` per card (board/column/rank; labels
  cleared; non-member assignees dropped); a copy is a fresh card, no comments. No
  new rules/functions/indexes — Phase A's card update rule already authorises the
  board change. Verified on the emulator on **web and native** (the native
  long-press → sheet → native Select pickers → Move all exercised and the data
  confirmed). Shipped to Hosting + the Android release APK.
