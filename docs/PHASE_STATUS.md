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
| 10 | Notifications | **in-app inbox complete** (2026-07-19). **PUSH IS NOT WIRED**: the functions send via FCM, but the app never registers a device token, so `pushTokens` is always empty and nothing is ever delivered. Decision needed — see below. |
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
- Sabeel brand palette and logo, light and dark, following the OS.

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
react-native-web; **semantic theme tokens with light/dark following the OS**.

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
picker; priority; per-board labels with light/dark-legible colors.

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
screenshots; `docs/DEPLOY.md`; Sentry wired on all three surfaces; accessibility
pass; release keystore.

**Exit criteria**
- Every screen has a designed empty and error state.
- Manual covers every user-visible feature, screenshots current.

## Push notifications are not functional (found 2026-07-20)

`functions/src/notifications.ts` sends through `getMessaging().sendEachForMulticast()`
using each user's `pushTokens`. Nothing on the client ever writes that field —
`auth.ts` initialises it to `[]` at provisioning and no code touches it again. So
`tokens.length === 0` on every call and the send returns early, every time.

The in-app inbox, the per-event preferences and the mute-a-board control all
work; only delivery to a device does not. That makes this the most dangerous
shape of unfinished work: it looks complete from the outside, including to
whoever writes the next feature on top of it.

Two honest options:

1. **Finish it** — register a device token on sign-in (expo-notifications or the
   FCM SDK), write it to `pushTokens`, and remove it on sign-out. Needs native
   config and a real device to verify; an emulator cannot prove delivery.
2. **Remove the send path** and rely on the inbox. Defensible for a team of this
   size, and "restraint is the feature" argues for it — but it should be a
   decision, not a silence.

Doing neither is the one option that is not acceptable, because the code
currently claims a capability the app does not have.

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

_(empty — first entry at Phase 13)_
