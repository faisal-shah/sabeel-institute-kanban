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
| 1 | Auth + approval + roles | not started |
| 2 | Boards + membership | not started |
| 3 | Columns + cards + ordering | not started |
| 4 | Mobile board | not started |
| 5 | Card richness | not started |
| 6 | My Work | not started |
| 7 | Bulk actions | not started |
| 8 | Comments + mentions | not started |
| 9 | Activity history | not started |
| 10 | Notifications | not started |
| 11 | Search + archive | not started |
| 12 | Polish + deploy readiness | not started |
| 13 | Production deploy | not started |
| 14 | ClickUp import + launch | not started |

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
- A non-`oursabeel.com` account is rejected by the *function*, proven with the
  consent screen bypassed (don't rely on the Internal setting for the test).
- New user lands `pending`; admin approves; the client picks up the claim change
  live without a manual sign-out.
- Rules tests cover every role × status combination.
- Only admins can promote; a member cannot escalate themselves. Tested.

## Phase 2 — Boards and membership

**Goal:** boards exist, with the access model fully enforced in rules.

Scope: board CRUD (create = manager/admin); board settings (name, description,
columns, labels); membership add/remove; the **remove-member callable** that also
unassigns; board list with favorites + recents; board archive.

**Exit criteria**
- Rules tests: member sees only their boards; manager sees all; member cannot
  create a board, edit settings, or add anyone.
- Removing a member unassigns them from that board's cards, in one batch.
- The full rules matrix from the brief is covered by tests.

## Phase 3 — Columns, cards, ordering ⚠️ technical core

**Goal:** correct, concurrent-safe card ordering.

Scope: `rankBetween` in `@sabeel/shared` with **property-based tests**; card CRUD;
column create/rename/reorder; column delete blocked while non-empty; web
drag-and-drop; lazy column re-rank on collision.

**Exit criteria**
- Property tests: `rankBetween` always returns a strictly-between value; 1000
  sequential same-position inserts never collide or degrade.
- Two simulated concurrent drags in one column both succeed, no lost move.
- **Verified under injected latency**, not just localhost — see
  `docs/INHERITED-STACK.md` lesson 5.
- Rules reject a card whose `columnId` is not on the board.

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
- Collection-group index committed to `firestore.indexes.json`.
- Rules tests: a user reads a card they're assigned to; **cannot** read a card on
  a board they don't belong to; cannot list all cards globally.
- Board names resolve with **no** extra reads (they come from the user's board list).

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
