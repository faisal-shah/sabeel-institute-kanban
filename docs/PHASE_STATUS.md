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

### 2026-07-27 — Files on a card — v0.2.0

**Attachments, reversing the 2026-07-19 decision not to have them.** Several
files per card, 10 MB each, any type, opened in whatever the system reader for
that type is. Any active board member may remove one — deliberately not the
manager-only gate permanent card deletion uses.

Backend provisioned 2026-07-26: `firebasestorage.googleapis.com`, bucket
`sabeel-institute-kanban.firebasestorage.app` in us-central1 (permanent choice,
one of the three regions with no-cost quotas), and
`roles/iam.serviceAccountTokenCreator` self-bound on the gen-2 runtime service
account.

**Everything about the design follows from one constraint: Storage rules cannot
read Firestore.** Board membership is a Firestore document, so `storage.rules`
can only ask "is this an active account". So the attachment DOCUMENT is the
upload's authorization — creating it is membership-checked, and the object goes
to a path derived from ids only that create could have produced. Objects are
write-once and unreadable; every download is a 1-hour V4 signed URL minted by a
callable that repeats the check. `getDownloadURL()` is refused outright: its
token never expires, so anyone who saw a link would keep access after leaving a
board.

Things that were got wrong first, and are worth not repeating:

- **A client cannot roll back its own failed upload.** In Storage rules `write`
  covers delete, and `resource == null` is false on one, so the planned
  client-side rollback would have deleted the record and stranded the bytes:
  unreferenced, unreadable, invisible, billable. Rollback goes through
  `deleteAttachment`, and a daily sweep catches uploads abandoned by a closed
  tab.
- **A retry must mint a NEW attachment id.** Write-once refuses a second write
  to the same path, which would surface as an alarming permission error on an
  ordinary retry.
- **How a file is served is stored on the OBJECT**, not passed as a signed-URL
  query override. Overrides are honoured only by real GCS, so inline-vs-download
  and filename handling would have been exercised by no local test at all.
  HTML and SVG normalise to octet-stream — served inline from a
  googleapis.com origin they would run script on Google's origin.
- **The functions emulator mints URLs against `127.0.0.1`**, which on an Android
  emulator is the device. Opening a file died with "Failed to connect to
  /127.0.0.1:9199" — pure addressing, but it reads as a broken feature. Rewritten
  to the reachable host, gated on emulator mode, because a production URL is
  signed over its host.
- **A rules test that passed alone and failed in the suite.** `clearStorage()`
  returns before the emulator finishes deleting, so a deletion issued in
  `beforeEach` landed mid-test and removed the object a write-once assertion
  depended on — making a second upload look permitted. Per-test object ids.
- **Photo names from a picker are meaningless.** The gallery reports a MediaStore
  id and the camera a bare UUID, so a card with three photos listed three
  identifiers nobody could tell apart. Both shapes are replaced with
  `photo-2026-07-27-1432.jpg`.

Android needed two manifest entries no library supplies: a `<queries>` entry for
VIEW with `mimeType */*` (on API 30+ package visibility hides every handler and
the tap silently does nothing), and `tools:node="remove"` on
WRITE_EXTERNAL_STORAGE. READ_EXTERNAL_STORAGE is deliberately left alone —
expo-image-picker declares it for the camera roll on API ≤ 32, minSdk here is 24,
and an API-35 AVD cannot test that path either way.

Verified: 304 unit, 215 emulator (including storage rules, mutation-tested — 17
denials go red when both rule files are opened), a 10-check web suite driving a
real upload, and the Android emulator driven by hand — the PDF opened in Drive's
`PdfViewerActivity`, the PNG in Photos' `HostPhotoPagerActivity`.

**Not verifiable before deploy:** V4 signing. The Storage emulator has no signing
service, so that branch is unexercised locally and the
`serviceAccountTokenCreator` grant fails only in production.

Also fixed in passing: `web-e2e.mjs` had rotted since the navigation shell and
the switch to icon actions, aborting at check 5 — six stale selectors repaired,
now reaching check 26. One of them, "a member does NOT get admin tools", was
probing a top-level People button that exists for nobody, so it had been passing
without testing anything. CI does not run the e2e, which is why nobody noticed.

### 2026-07-26 — The org timezone was an hour out — v0.1.34

**`ORG_TIMEZONE` was `America/New_York` for a Houston team.** Now
`America/Chicago`. It survived this long because nothing about it looked like a
bug: due dates are all-day `YYYY-MM-DD` strings, so the only symptoms were a card
turning overdue an hour early — at 11pm the night before — and the due-soon
reminder arriving at 07:00 local instead of 08:00. The weekly prune and the daily
reminder are both scheduled in this zone, so both move with it.

The test suite could not have caught it. It asserted
`todayInOrgTz('2026-07-19T02:00:00Z') === '2026-07-18'`, and 02:00Z is the
previous day in Chicago *and* in New York — the assertion was true under the
wrong configuration, so it could never fail. The test now pins an instant that
differs (04:30Z on 19 July is the 18th in Chicago and already the 19th in New
York), which means moving the constant back fails rather than passing quietly.
Worth generalising: a test whose expected value would not CHANGE if the constant
were wrong is decorative.

There is nothing to align with the sibling time-tracker, and `CLAUDE.md` now says
so explicitly, because the obvious future instinct — make the siblings match —
would be wrong. That project has no org timezone by design; it buckets each entry
in the timezone where the work happened.

Also from the sibling maintainer's review of `docs/VERSIONING-RULE.md`: the
version shape check `^\d+\.\d+\.\d+$` accepts `2026.07.01`. Apple accepts it
too — digits and periods — but `07` and `7` are the same number, so a date-style
scheme silently stops increasing and every numeric derivation downstream reads 7
where a human reads 07. Now `^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$` in
both `check-version.mjs` and `build.gradle`, and the validator **self-tests on
every run** against seven bad shapes including that one — the hole existed
precisely because the regex had never been pointed at a date.

**The download page carries a published date and time.** The public URL is a
rolling asset, so the page and the link are byte-identical before and after a
publish; without a timestamp nobody, us included, can tell whether the file
behind the button is the build just cut or last month's. `publish-apk.sh` writes
both labels and greps them back, failing rather than trusting `sed`, and the
timestamp is pinned to the org zone rather than the build machine's. See
`docs/DEPLOY.md` step 4.

**The Sentry cron canary had been reporting missed every day.** `healthCheck`
carried its own hardcoded `America/New_York` — a second copy of the org zone,
which silently did not move when the real one did, at which point its comment
("well clear of the 08:00 run") was reasoning across two clocks. Worse, the
monitor was upserted with **no timezone at all**, and Sentry defaults that to
UTC: it expected a check-in at 03:15 UTC while the job ran at 07:15 UTC, four
hours outside the 60-minute margin. A canary that cries wolf daily is worse than
none, because you stop reading it. The monitor now sends its timezone, and
`HEALTH_TIMEZONE` is `ORG_TIMEZONE` rather than a duplicate.

**Cross-project cleanup, from the time-tracker maintainer's review.** Both repos
are confirmed aligned on versioning (their `49c447f`): same no-leading-zeros
shape, same `versionCode` formula, same pinned `TZ=America/Chicago` page
timestamp. Two asks, both done — a stale comment here claiming their page used a
bare `date` (it is pinned now), and `docs/VERSIONING-RULE.md`, which had grown a
full second copy of the general rule that now lives in the `expo-firebase-stack`
skill. It is a pointer plus the project-specific facts, same shape as
`docs/STACK-GOTCHAS.md`. The shared skill itself had grown THREE overlapping
versioning entries; consolidated to one.

Their mutation technique, applied here: `ORG_TIMEZONE` was flipped back to
`America/New_York` to confirm the new test actually goes red. It does, and it is
the only one that does. Also swept the unit suites under UTC, Pacific/Kiritimati
(+14), Pacific/Midway (-11) and Asia/Kolkata — all clean, so nothing silently
depends on the build machine's zone.

And their warning about the Gradle daemon is now guarded: `expo run:android`
leaves one resident on ~3.7 GB, this machine runs earlyoom with `java` and
`gradle` on its prefer list, and the emulator it kills mid-suite presents as
ECONNREFUSED — i.e. as a broken diff. `test-emulator.sh` stops the daemon before
starting emulators.

### 2026-07-26 — Mentions in edits, and two review findings — v0.1.33

**@mentions did not work when editing a comment.** Three faults stacked, only
the first visible. The edit box was a bare field while the composer had the
autocomplete inline — two boxes doing one job, one of which had quietly stopped;
both now use `MentionField`. Underneath, `editComment` never re-derived
`mentionUids`, so even typing the handle correctly did nothing, and an edit lied
in both directions: adding "@sara" recorded no mention, deleting one left her
listed as mentioned by a comment that no longer names her. And the notifier was
create-only, so a mention added by editing reached nobody. It watches writes now,
notifying whoever is NEWLY named — diffing against the previous list is what
stops a typo fix from re-paging the thread — while `commentOnMyCard` stays
create-only, because an edit is not a new comment. `onCommentCreated` became
`onCommentNotify` to match `onCardNotify`.

That exposed a rules gap: `create` required every mentioned uid to be a board
member, `update` allowed the field and checked nothing. The invariant held for a
new comment and could be walked past by editing one. Proved the new test catches
it by removing the guard and watching it fail with "Expected request to fail, but
it succeeded".

**A title save destroyed an unsaved description.** Found by review, reproduced,
fixed. The card screen had ONE `dirty` flag guarding the effect that re-seeds
both editors from the server, but both editors can be open at once — so saving or
cancelling the title cleared the flag, re-armed the effect, and the next snapshot
overwrote a description someone was still typing. No error, nothing to undo.
Confirmed against the running app before ("LOST") and after ("SURVIVED"). One
flag per editor now, checked field by field.

**The live-data error banner outlived its session.** Module-level like the result
cache but not cleared with it, so signing out while "permission-denied" showed
left the next person on that device reading a refusal that was never theirs.

**Board `update` rules are now as strict as `create`.** An update rule laxer than
its create rule means the shape is only guaranteed for a document's first write,
which is not a guarantee — exactly the comment-mention trap in another place.
`createdAt` and `activeCardCount` are pinned (the latter is trigger-owned;
`onCardBoardCount` writes it via the Admin SDK, which bypasses rules), `archived`
must be a bool and `memberProfiles` a map. `.get(field, default)` on the pinned
fields, so a board written before one of them existed does not become
permanently uneditable.

**The notification inbox is pruned weekly, keeping 90 days.** Nothing had ever
deleted a notification: the client can dismiss what it sees, but Alerts lists
only the newest 50, so everything below that accumulated forever. Per user
rather than a collection-group query — there are tens of accounts, and a
collection-group query on `notifications` would need a collection-group-scoped
single-field index Firestore does not create automatically, which would fail at
runtime inside a scheduled job where nobody is watching. Pruned by age whether
read or not, because an unread entry below the 50-item line is already
unreachable and only leaves the badge counting something nobody can open. When a
sweep removes anything unread the badge is RECOMPUTED from the survivors rather
than decremented, which also repairs drift from any other path. The retention
figure lives in `@sabeel/shared` so the number the server enforces is the number
the settings screen quotes.

**Version numbering was two releases from a collision.** Raised while looking
ahead to an eventual iOS build. The reported blocker — that the App Store only
accepts X.Y.Z — turned out not to apply: Apple's rules (TN2420) are digits and
periods only, beginning and ending with a digit, at most three components, at
most 18 characters, strictly increasing; `0.1.33` satisfies all of them, and
starting at 0.x is fine because 0.1.33 < 1.0.0.

The real fault was next door. The Android versionCode was
`major*10000 + minor*100 + patch`, two digits per field, and **0.1.100 and 0.2.0
both computed to 200** — a collision, not a quirk: Android refuses an install
whose versionCode is not greater than the installed one. At the rate patches were
landing that was weeks away. Now `major*1000000 + minor*1000 + patch`, which only
ever produces larger codes than the old scheme (0.1.33: 133 → 1033), so
monotonicity survives the change; out-of-range components stop the build instead
of colliding silently. `scripts/check-version.mjs` enforces store legality from
`web:export` (so CI runs it) and from `publish-apk.sh`, the last gate before a
tag and a public download exist.

### 2026-07-26 — Notifications you can act on — v0.1.32

Started as "tapping a notification should open the thing it is about" and turned
into an audit of the whole notification path, which had four separate faults.

**Tapping did nothing, in two different ways.** In the Alerts list an
account-approval alert was inert, because those are written with an empty
`boardId` and the handler only knew how to open boards and cards. In the phone's
notification tray *nothing* was tappable — there was no response listener
anywhere in the app, so the `boardId` and `cardId` the server had been putting in
every payload were read by no one. `routeForNotification` is now the single
mapping both use: they arrive by completely different routes, a Firestore
document and an FCM data payload, and where they land is the one thing that must
never drift. `type` joined the payload because it is the only routing signal a
`newUserPending` carries.

`pushOpen.ts` mirrors `deeplink.ts` deliberately. An intent can arrive while the
app is running or BE the reason it started, those are two different APIs, and
skipping the second is how "it works when I test it" becomes "it does nothing
from a cold phone" — backgrounded is the case that works either way.
`takeInitialPush` uses the library's own `clearLastNotificationResponse` rather
than a hand-rolled consumed flag; that API exists for precisely this, and both
`…Async` forms are deprecated in SDK 57.

**The badge stayed up after acting on a push.** Tapping in Alerts marks the entry
read; tapping the same notification in the tray did not, because the payload
could not say which entry it was. The inbox id now travels with the push — which
means one message per device rather than a multicast, since
`sendEachForMulticast` sends one payload to every token and the payload now
differs per recipient.

**Every push landed in a channel called "Miscellaneous".** The app created a
channel named "Default" that nothing posted to, because the server never sent a
channel id; expo-notifications does not error on that, it logs and falls back to
its own channel. The id now lives in `@sabeel/shared`, since both sides must name
it and neither can check the other. It is a NEW id at HIGH importance — matching
what the fallback was already doing, so nothing goes quieter — because Android
fixes a channel's importance at creation and an app may never raise it, only the
person can. The dead channel is deleted rather than left as a second, silent
entry someone would try to configure.

**A rotated FCM token silently ended notifications.** Registration ran only at
sign-in, so when FCM rotated a token the stored one died, the server pruned it on
the next send, and that person stopped hearing anything until they happened to
sign out and back in. `addPushTokenListener` files the new one, and is removed on
sign-out first so a rotation mid-sign-out cannot re-file the token under the
account being detached.

Also: two labels can no longer differ only in case, matching columns. A card face
shows a label's name and nothing else, so "Urgent" beside "urgent" is a pair
nobody can tell apart.

Verified on the Android emulator with real notifications rather than by reading
the code: a tap routes to People; a card notification that ARRIVES WHILE THE
PROCESS IS DEAD opens the card on launch; `unreadNotifCount` goes 1 → 0 and
`read` false → true in Firestore across the tap; and `dumpsys` reports
`Notification(channel=sabeel-alerts)` at importance 4. Worth recording for next
time: `force-stop` cancels pending alarms *and* clears posted notifications, so
it cannot produce a cold start — `am kill` leaves both intact.

Known and left alone: the inbox is never pruned (a Firestore TTL policy is the
fix if it ever matters at this scale), and web push stays inert without a VAPID
key (TODO § I), so tray taps in a browser do nothing.

### 2026-07-26 — Text that escaped its row — v0.1.31

Reported from the Android app: a long column name printed on top of the pager's
"‹ Prev" button. One mechanism, three places, and a platform split that hid all
of them from the browser.

**Text will not shrink unless told to.** A `<Text numberOfLines={1}>` sharing a
flex row with a sibling is measured against the row's *full* inner width and then
laid out *beside* that sibling, so the row's content comes out wider than the
row. `numberOfLines` is no defence: the text still truncates with an ellipsis,
just at the wrong width, so the result looks deliberate. What happens to the
overrun is where the platforms part company — react-native-web gives a `View`
`overflow: hidden` and clips it, while native `View` is `overflow: visible` and
draws the text straight over its neighbour. Every browser screenshot said the
screen was fine.

`ColumnNameEditor` applied its shrink as `!center && styles.shrink`, so the
centred variant — used by exactly one surface, the phone pager — was the only one
that could not shrink. Shrink is now unconditional, and the pager asks for two
lines: it is the one place where the name *is* the row, with empty space above
and below to grow into. Auditing the rest of the codebase for the same shape
found it once more, in the card detail's board crumb, where a board name (120
characters are allowed) sits beside a 13px icon and would spill over the Share
and Back actions.

**Chips are the same bug turned inside out.** A label or assignee chip is a box
drawn *around* text, so it grows with the name and an over-long one draws wider
than the card it sits on; `flexWrap` cannot help, because wrapping moves an item
to the next line and never makes one narrower. The two halves need opposite
fixes. A label name is ours, so it is capped at the source: `LABEL_NAME_MAX` is
40 — labels were the one name in the app with no limit anywhere, while board
names, column names, card titles and comments all had one. Rules are *not* the
enforcement point and cannot be: rules have no way to iterate a list, so a
per-entry check on the embedded `labels` array is not expressible. An assignee's
name is the Google display name, external input with no in-app path to set it, so
that bound belongs at the render — a `maxWidth` plus the `flexShrink` that turns
it into an ellipsis instead of an overrun.

**The seed was the reason these reached Faisal first.** Every phone-layout bug
filmed so far needed either a name too long for its row or a column with more
cards than fit on a screen, and the dev seed had neither — six short cards in
tidy columns. It now creates both by default.

Verified on the Android emulator (where the bug was filmed) and on web at 390px
with measured geometry rather than eyeballing: the column name clears ‹ Prev by
8px, the crumb ends at x=270 against Share at x=278, and a full 40-character
label badge is 324px of the 337 available — which is what makes 40 the tight fit
rather than a guess.

### 2026-07-26 — Four bugs from a phone browser — v0.1.30

All four came from Faisal using the app on his phone, three of them in the mobile
BROWSER rather than the Android app — a surface no amount of code reading or
emulator work had been exercising.

**A column of cards could not be scrolled, and "+ Add card" fell off the screen.**
Two of the reports, one cause. A column page had no `flex: 1` and its `FlatList`
had no `style` at all, so react-native-web sized the list to its CONTENT. Past
about ten cards the list overflowed the page, which clips (a View is
`overflow: hidden`), so the last card was sliced in half and the action row was
pushed below the fold — and **nothing scrolled**, because no element had
scrollable overflow at all. The same tree behaves on native, which is exactly why
it only ever appeared in the browser. It also explains the second report: a
content-sized list leaves no space to push the action row down, so on web it sat
directly under the cards while Android pinned it to the bottom. Measured before
and after: the container went from `overflow-y: hidden`, wheel-inert, last card
at y=940 in an 844px viewport, to `overflow-y: auto`, scrolling, with the button
at y=784.

**A white band appeared below the app while scrolling, and stayed.** The web
shell is Expo's generated template, whose reset sizes `#root` with
`height: 100%`. That resolves against the layout viewport, which does not follow
a mobile address bar as it collapses — so the moment the bar hid, the visible
area grew past the app and bare page showed through. The project now owns the
shell (`app/public/index.html`), sizes the root in `dvh`, and paints html/body
the app's canvas colour so any momentary disagreement shows brand rather than
white. `scripts/check-web-template.mjs` runs on the export path (and therefore in
CI) and fails if the `dvh` rule disappears or the colour drifts from
`palette.ts` — the template is a hand-merged copy of a vendor file, and both
fixes are invisible to the type system and to the ESLint colour rule.

**The Archived chip widened the results instead of narrowing them.** It sat
beside Overdue, Urgent and High — all of which restrict — while `includeArchived`
ADDED the archive to whatever else matched. Correct when it was a checkbox
labelled "including archived"; a trap once it became a chip, and one you could
only catch by counting rows, which is how Faisal caught it (63 → 67, same live
cards still on top). Now `archivedOnly`: the two sets never mix, the Firestore
query constrains to one archive state so it also fetches less, and the test
asserts every live card is *gone* rather than merely outnumbered — the old test
passed under both meanings.

### 2026-07-26 — Archiving a board now puts its work away too — v0.1.29

A wide audit at Faisal's request, after the previous review turned up three
defects and left the fair question of how many more were hiding. One root cause
with three symptoms, plus one piece of half-finished data.

**An archived board was hidden but not quiet.** The board vanished from every
list while its cards stayed fully live: they kept appearing in **My Work**
(rendered as "in a board" — no name, no labels, no assignee chips, because the
board was no longer in the lookup), the **due-soon sweep** kept reminding people
about them, and assignment/comment/mention **notifications** kept firing. Search
was already correct, because it derives its card set from the board list — and
that asymmetry is what marked this as an oversight rather than a decision. It is
the same shape as the assignee bug found in the previous pass: one question
answered two different ways in two places.

- **Client**: My Work now keeps only cards whose board it can actually see, the
  same scoping Search uses. No denormalised `boardArchived` on every card, and no
  fan-out when a board is archived. It waits for the board list as well as the
  cards, so it cannot flash "nothing assigned to you" at someone who has plenty.
- **Server**: the check lives in `notify()`, the one place every notification
  passes through, so a future trigger inherits it rather than having to remember
  it. Deliberately **not** memoised in a module-level map: function instances are
  reused between invocations, so such a cache outlives the call, and archiving
  then restoring a board would leave a warm instance suppressing its
  notifications with nothing to show why. One document read is the cheaper
  mistake.

**`archivedAt` was written by bulk archive only, and read by nothing.** Half the
archive had the field. It is now written on every archive path and cleared on
restore, and the archive screen orders by it — newest first, which is what you
want when hunting for the thing you just put away. Rank, which it used before, is
a board position and means nothing once a card is off the board.

Verified end to end, not just by unit test: a card assigned and visible in My
Work, its board archived, the card gone; two cards archived in sequence and the
later one on top. An integration test pins the notification silence, with a
control on a live board so an empty inbox proves silence rather than a no-op.

**A second pass, over different ground.** Notifications, tokens, dates, session
claims and every list screen's failure path.

- **A failed query still rendered its empty state.** The error itself was never
  silent — `Screen` has shown a live-data banner for a long time — but underneath
  that banner every list fell through from `loading` to `data ?? []` and printed
  its empty message. A red bar saying something broke, directly above "No boards
  yet. Create one to get started." for someone with fifteen boards. The likeliest
  real causes are losing access to a board mid-session and an index that exists
  locally but was never deployed, and both then read as data loss. Each list now
  says it could not load, and the board says it with a header and a Back button:
  the first attempt returned a bare panel on the immersive board, which has no
  tab bar, and stranded the reader with no way off the screen. Found by forcing a
  genuine `permission-denied`, not by reasoning about it.
- **`todayInOrgTz` was defined twice** — once in `@sabeel/shared`, used by the
  card face, My Work and Search, and once privately in `CardScreen`, whose copy
  carried the comment "the only place a timezone is consulted". Identical today,
  so nothing was visibly wrong; the card's overdue badge would simply have
  disagreed with the card face beside it the moment either changed. The private
  copy is gone. That is the third instance of one rule living in two places, so
  it is now a thing to look for rather than a coincidence.

**Checked and found correct**, recorded so the next audit can skip them: push
tokens are unregistered BEFORE the auth sign-out (after it, the delete would be
denied and silently swallowed); dead FCM tokens are pruned on exactly the two
codes that mean "gone"; `commentCount` tolerates its card having been deleted;
claim refresh is bounded by timeouts and falls back to the cached token rather
than stranding anyone on a spinner; `addDays` is UTC arithmetic on date-only
keys, so it is immune to DST.

### 2026-07-25 — Review of the reworking: a card that could not come back — v0.1.28

A deliberate read-through of everything the last three releases touched, at
Faisal's request. Three defects, all in code shipped hours earlier, none of which
a test or a screenshot would have caught.

**An archived card could become permanently unrecoverable.** A column may be
deleted once it holds no LIVE cards — and the message shown when deletion is
blocked says "move or **archive** them first" — so archiving a column's cards and
then deleting the column is the path the app itself recommends. Those cards keep
a `columnId` that no longer exists, and `firestore.rules` checks
`columnId in board.columnIds` on **every** update via `wellFormed()`. So
un-archiving was rejected outright: the card could not be restored, could not be
edited, and a member (who cannot delete) had no way out of it at all. Reachable
only since v0.1.25, which added the Restore button that hits this. `restoreCard`
now re-homes such a card into the first column, at the bottom, and says where it
went. Pinned by a rules test that asserts both halves — the stale write refused,
the re-homed one accepted.

**The assignee trigger asked a different question than the picker answered.** The
heading used `members.length > assignees.length` as a proxy for "is anyone
available", while the picker computed the actual set. They disagree exactly when
an assignee is no longer a board member — the orphan case the picker explicitly
handles — leaving a real, assignable member unreachable. Both now call one
exported `assignableCandidates`.

**Two pickers could be left open over nothing.** Assigning (or adding) the last
candidate emptied the list while the picker was still open, and because the
heading's trigger hides while a picker is open, the section was left with no way
to reopen it; unassigning someone later made the picker reappear unbidden. Both
now close themselves when they empty.

Also caught in review and corrected before commit: a `useMemo` placed below an
early return (a conditional hook — ESLint's `rules-of-hooks` catches it, verified
by deliberately reintroducing it), and a `useEffect` referencing a `const`
declared further down the component, which would have thrown on every render.

### 2026-07-25 — Canonical controls, and a badge that could never come down — v0.1.27

Faisal named one instance ("the settings button should just be a gear sign") and
asked for the rest of the app to be audited against the same rule, then ruled on
the list. Words are now reserved for the primary action of a screen and for
anything destructive *and* unusual; everything else uses the control the world
already agreed on.

- **Alerts**: gear/inbox to switch sides, `✕` to dismiss one, `✓✓` to mark all
  read, and a new **dismiss-all** sweep that **asks first** — it empties the
  inbox and there is no undo. Notification preferences are **real toggles**
  (Faisal overrode a recommendation to keep them as On/Off words), and muting a
  board is a bell.
- **Assignees / members / labels**: person-add, person-remove, and `✕` in place of
  labelled buttons; a `+` beside the field that adds a column or a label.
- **Deliberately left alone**: Delete column, Delete permanently, Archive card,
  Delete N (destructive *and* unusual); New board, Create, Sign in, + Add card,
  Comment (primary actions); every Cancel; Approve/Reject on People.

**A real bug the work uncovered.** `dismiss()` deleted the notification document
and nothing else — and there is **no delete trigger** (`functions/src/
notifications.ts` only ever increments on create). So dismissing an *unread*
alert left `unreadNotifCount` counting a document that no longer existed: a badge
showing 3 over an inbox with nothing unread in it, permanently. It is now a
transaction that re-reads `read` before touching the badge, the same shape
`markRead` already used and for the same reason. Three rules tests pin that a
client may both delete its own entry and adjust its own badge.

**Sections carry their own action.** Faisal: "we can save some vertical space by
putting the add assignee icon in the same row as the assignee's label." The card
screen already did exactly this for Description, hand-rolled; `Heading` now takes
an optional `action`, so it is one pattern rather than a per-screen improvisation.
Board settings gained the most: the standing "Add someone" panel — which grew a
row per person in the directory — became an icon on the *Members* heading opening
a capped, scrollable picker. Subtasks and **New board** were considered and left
as they are: the first saves no height, the second is a screen's primary action.

### 2026-07-25 — Search browses by default, with filter chips — v0.1.26

Faisal's idea, and it fixes the archive problem from a second direction: Search
showed **nothing** until you typed, so the only way to find a card was to already
know its name — which is exactly what you cannot do when you are looking for
something you archived.

- **Browses by default**: every card on every board you are on, **newest first**.
  The shared `rankMatches` already returned everything for an empty query; it was
  the screen that gated on `text.trim().length === 0`. With a query it ranks by
  relevance as before; without one it orders by `updatedAt`, so the default view
  answers "what has been happening across my boards".
- **Filter chips** — Archived, Overdue, Urgent, High — each mapping to a filter
  that already existed and was already tested in `@sabeel/shared` and had simply
  never been surfaced (noted as a known gap since Phase 12). Kept deliberately
  few: "Assigned to me" would duplicate My Work, and a full label/assignee matrix
  would rebuild the board filters that were parked on purpose.
- **An honest cap** rather than a silent truncation: the render is bounded at 200
  and says how many were left out. Filtering stays in memory over the cards
  already fetched — the right call at this size (tens of cards), and the cap is
  what stops it degrading badly if that ever stops being true.

**Scale, stated plainly.** Search fetches every non-archived card across your
boards in one shot and filters client-side. That was already true; browse-by-
default just means you always pay it. At 41 cards it is nothing. The agreed
position is to keep it simple now and revisit if the card count grows an order of
magnitude — at which point the shape is known: chips become server-side
constraints (they are all indexable equality filters) while the text box stays
client-side, because Firestore cannot do full-text search at all.

### 2026-07-25 — Archive is reachable, titles read as titles, subtasks in history — v0.1.25

Three things from a review pass, all of them gaps rather than regressions.

- **Archived cards had no way back.** Members can only archive (never delete),
  precisely so nothing is lost — but the sole route to an archived card was
  global Search, in a different tab, behind an "Including archived" toggle that
  gave no hint that was where your card went. **A reversible action you cannot
  discover how to reverse is not reversible.** The board header now has an
  archive icon opening that board's archived cards, each with **Restore to the
  board**; permanent delete stays managers/admins. Available to everyone, since
  members are the ones who archive. New `useArchivedBoardCards` reuses the
  existing `(boardId, archived, rank)` index — the other value of `archived`.
- **The title was a permanently-open text input**, which was wrong twice over: a
  card's name is the thing you came to read, and a single-line field **truncates**
  it, so a long title could not be read in full on the one screen devoted to that
  card. It now reads as the page heading and wraps; a pencil turns it into a
  field, matching Description directly below. The generic "Card" heading above it
  went with it — the card's own title is the heading now.
- **Subtask links were invisible in history.** Logged now, and on **both** cards:
  `parentId` lives on the child, so the diff only ever sees the child — but you
  link a subtask while looking at the PARENT, and history that says nothing where
  the action was taken reads as the action not being recorded. The trigger writes
  a mirrored entry, so the parent shows "added X as a subtask" and the child
  "made this a subtask of Y". Both store the other card's **id**, resolved to a
  title at render, so a rename never leaves stale history — the same reason
  `moved` stores a column id.

### 2026-07-25 — Subtask lateral review: a one-way door, family moves, the pager — v0.1.24

Reviewing subtasks against archive / delete / move turned up a trap I had
shipped hours earlier, plus the pager bug caught on video.

- **The unlink one-way door.** Archiving or moving a parent left the child
  silently still linked: no sign it was a subtask, no unlink (the only one lived
  on the now-unreachable parent), and excluded from every picker **forever**,
  because `canBeSubtaskOf` refuses an already-parented card. Reproduced in the
  emulator: on a board seeded that way, "Link an existing card" was **disabled**
  with no explanation, because the only candidates were the stuck cards. The link
  lives on the child, so the child now always shows it and can always let go —
  including when the parent cannot be resolved, where it says so plainly rather
  than hiding.
- **Family moves.** `bulkMoveToBoard` cleared `parentId` unconditionally, so
  moving a parent together with its subtasks silently flattened the structure.
  The link now survives exactly when both ends travel — `parentAfterMove()` in
  `@sabeel/shared`, unit-tested, so the rule is named rather than inline.
- **The pager (from the video).** Backing out of a card left the header on the
  remembered column while the body still rendered column 1 — which was empty, so
  it read as the cards having vanished. The restore was a `scrollTo` deferred a
  frame. The pager is now measured by a wrapper and mounted only once the width
  is known, scrolls on `onContentSizeChange` (the first moment a scroll can
  land), and is held invisible until it is on the right column: **a blank frame
  beats a wrong one**. Guarded by `needsRestore`, so a remembered page that no
  longer exists (columns deleted since) cannot leave the board permanently blank
  — a corner the fix itself introduced.
- **The orphan sweep** tolerates a concurrently deleted child (per-child updates,
  not one atomic batch). Scope stated honestly in the code: the ordinary case was
  already safe, and the regression test passes against the batched version too.
- `probe-indexes.mjs` now covers the sweep's `parentId ==` query.

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
- **Both ways to add share one row**: type a title and press **+**, or press the
  **link** icon to attach a card that already exists. Adding an existing card
  started as a full-width labelled button — the exact mistake `CLAUDE.md` records
  having been made three times, since a labelled button for an ordinary action
  costs a row of the card on every open. Caught in review and corrected.
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
