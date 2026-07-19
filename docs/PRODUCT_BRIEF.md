# Sabeel Institute Kanban — Product Brief

## Context

Sabeel Institute (small nonprofit, **under 50 people**, all internal — no external
or public users) currently runs on ClickUp and wants off it for three reasons:

1. **The interface is too busy.** Outside the kanban board itself, the team uses
   almost none of what ClickUp offers, and the surrounding feature mass gets in
   the way.
2. **The 5-board cap.** They need unlimited boards.
3. **No good mobile story.** They want real on-the-go usage from a phone.

So the product is: **a featureful kanban board, access-controlled across unlimited
boards, that is genuinely good on a phone.** Nothing else.

Faisal is the developer. The nonprofit's staff are the admins/managers in the app.

## Product invariants (do not silently change)

- **Restraint is the feature.** The reason to leave ClickUp was interface bloat.
  Every proposed addition must justify itself against "does the team actually use
  this?" No dashboards, no integrations, no automations, no Gantt/calendar/list
  view alternates, no time tracking (that lives in the sibling time-tracker app).
  When in doubt, leave it out and ask.
- **No board limit.** Nothing in the data model, UI, or rules may cap board count.
- **Phone-first, not phone-compatible.** The mobile board is a distinct layout
  (below), not a squeezed desktop board. Every feature ships with a phone design.
- **Three org-wide roles, not per-board roles.** See below — this is deliberately
  simpler than the per-board role matrix originally sketched.

## Decisions (settled with Faisal, 2026-07-18)

| Topic | Decision |
|---|---|
| Auth | Google sign-in **only**, restricted to **`@oursabeel.com`** — a Google Workspace domain (confirmed 2026-07-19). Domain match alone is not enough: every new account still lands `pending` and an **admin** individually approves or rejects it. |
| Roles | **Org-wide: admin / manager / member.** No per-board roles. |
| Board count | **Unlimited.** |
| Card basics | Title, description, **assignees** (multiple), **due date**, **priority**, **labels/tags**. |
| Card extras | **Comments with @mentions**, **per-card activity history**. |
| Cross-board view | **"My Work"** — every card assigned to me across every board, sorted by due date. First-class screen, and the phone's default landing surface. |
| Due dates | **All-day dates only** (`YYYY-MM-DD`), no time-of-day, no start dates. |
| Labels | **Per board.** No org-wide label vocabulary. |
| Description format | **Markdown**, edited in a native `TextInput` with a formatting toolbar, rendered on display. Explicitly **not** a WebView rich-text editor — see "Why markdown". |
| Search | **Global across the boards you belong to**, client-side matching. See "Search". |
| Notifications | Push **plus an in-app inbox** with an unread badge. |
| Watchers | **None.** Assignment and @mention are the only ways to get notified about a card. |
| WIP limits | **None.** Dropped from the model. |
| Column deletion | **Blocked until the column is empty**, made painless by multi-select bulk actions. |
| Bulk actions | **Multi-select cards** → move, archive, delete, assign. |
| Board list | **Favorites + recents**, then everything else alphabetically. No folders. |
| Card deletion | Members **archive** only. Permanent **delete is managers/admins**. |
| Offboarding | A disabled user **keeps their assignments**, rendered as inactive; managers get a review list to reassign. |
| Theming | **Light and dark, following the OS setting.** Built in Phase 0, not retrofitted. |
| Explicitly NOT in v1 | **File attachments** (dropped — no Cloud Storage at all), checklists/subtasks, custom fields, dependencies, recurring cards, alternate board views, automations, integrations, guest/external access. |
| Mobile layout | **One column at a time, swipe between columns.** Full-width cards stay readable; moving a card is an explicit "Move to…" action, not a drag. |
| Web layout | Classic horizontal multi-column board with real drag-and-drop. Web is the big-screen surface for board setup and bulk work. |
| Card ordering | **Fractional string ranks** (LexoRank-style, base-62) in `@sabeel/shared`. A move is a single-document write. |
| Notifications | Push (FCM), with **per-user, per-event-type control**. See "Notifications". |
| Archived cards | **Kept indefinitely**, hidden from the board, reachable via filter. Cards are small text documents and the team is <50 people; auto-deletion buys nothing and loses history. Revisit only if volume surprises us. |
| Offline | Firestore **persistent local cache enabled** on both surfaces. No offline-conflict UI in v1. See "Offline". |
| ClickUp migration | **Dev-side, human-in-the-loop, pre-deployment setup step.** Never an app feature. |
| Team size | <50 users, all internal. Sizing assumptions may rely on this. |

## Roles and access

Three org-wide roles, held in **custom claims** and mirrored to the user doc for
display. Rules trust the token, never the doc.

| | member | manager | admin |
|---|---|---|---|
| See a board they've been added to | ✓ | ✓ | ✓ |
| Create/edit/move/archive cards on such a board | ✓ | ✓ | ✓ |
| Comment | ✓ | ✓ | ✓ |
| **See every board / join any board** | | ✓ | ✓ |
| **Create boards** | | ✓ | ✓ |
| Manage columns, labels, board settings | | ✓ | ✓ |
| Add/remove board members | | ✓ | ✓ |
| Archive/delete a board | | ✓ | ✓ |
| **Approve/reject/disable user accounts** | | | ✓ |
| **Promote to manager or admin** | | | ✓ |

Consequences worth being explicit about:

- **Boards are private from members, not from managers.** Any manager can see and
  join any board. If the team ever needs a board that managers genuinely cannot
  see (HR, board-of-directors matters), this model does not support it — tell me
  and it becomes a per-board privacy flag.
- **A member's board list is exactly the boards they've been added to.** Only a
  manager or admin can add them.
- **Membership still matters for managers** even though it doesn't gate access: it
  drives "my boards" and who gets notified. A manager "joining" a board is just
  adding themselves to the member list.
- Members cannot add anyone to a board, including themselves.

### Domain restriction is a server-side check

Google's `hd` hint on the client is a **convenience, not a security boundary** — a
determined user can complete a sign-in with any Google account. `oursabeel.com`
being a Workspace domain gives us four layers, in order of trustworthiness:

1. **OAuth consent screen set to "Internal"** — Google itself refuses sign-in from
   outside the Workspace. Strongest layer, and available only because the domain
   is Workspace-managed.
2. **An auth-create Cloud Function** verifies `email_verified` and the email
   domain server-side, marking anything else `rejected` immediately. This is the
   layer that must exist even if someone later flips the consent screen to
   External.
3. **`firestore.rules`** never grants access on domain alone — only on
   `status == 'active'`, which only an admin can set.
4. **The client passes `hd=oursabeel.com`** purely so the account chooser does the
   right thing. Never treated as a check.

## Data model

```
users/{uid}
  displayName, email, photoUrl
  status: pending|active|rejected|disabled
  role:   member|manager|admin
  notifyPrefs: { mention: bool, assigned: bool, dueSoon: bool, … }
  mutedBoardIds: [boardId, …]
  favoriteBoardIds: [boardId, …]
  recentBoardIds: [boardId, …]                   # client-maintained, capped at 10
  pushTokens: [ … ]
  unreadNotifCount
  # Mirrors custom claims for UI display. Rules trust the TOKEN, never this doc.

users/{uid}/notifications/{notifId}                # the in-app inbox
  type, boardId, cardId, actorUid, at, read: bool, text
  # Trigger-written, like activity. The client may only flip `read`.

boards/{boardId}
  name, description, archived: bool, createdAt, createdBy
  columns: [ { id, name } ]                      # embedded: few, rarely changed
  labels:  [ { id, name, color } ]               # embedded: per-board, small
  memberUids: [uid, …]                           # for `array-contains` queries

boards/{boardId}/cards/{cardId}
  title, description                             # description is markdown source
  columnId, rank: string
  assigneeUids: [uid, …]                         # MUST be board members (rule-enforced)
  dueDate?: string                               # 'YYYY-MM-DD' — an all-day date, NOT a timestamp
  priority: none|low|med|high|urgent
  labelIds: [id, …], archived: bool, archivedAt?
  commentCount                                   # denormalized for the card face
  createdAt/By, updatedAt/By

boards/{boardId}/cards/{cardId}/comments/{commentId}
  authorUid, body, mentionUids: [uid, …], createdAt, editedAt?

boards/{boardId}/cards/{cardId}/activity/{activityId}
  type: created|moved|assigned|unassigned|due|priority|labels|edited|archived
  actorUid, at, from?, to?
  # Written ONLY by a Firestore trigger. Clients have no write access at all,
  # so the log cannot be forged or edited.
```

No Cloud Storage bucket, no `storage` section in `firebase.json`, no storage
rules — attachments are out.

**Why cards are a subcollection of the board:** every query the app makes is
board-scoped ("cards in this board, this column, by rank"), and it lets the rules
resolve permission from exactly one parent `get()`.

Note that `memberRoles` from the earlier draft is **gone** — with org-wide roles,
`memberUids` alone is enough.

### Ordering

Ranks are **base-62 strings**, not floats. Floats exhaust double precision after
roughly 50 consecutive inserts at the same position, which a busy column reaches;
strings can always be subdivided. `rankBetween(a, b)` lives in `@sabeel/shared`
with property-based tests, and is the only place that math exists.

Moving a card = one write to that card: `{ columnId, rank }`. Two people dragging
in the same column touch different documents and both succeed. A rare rank
collision is cosmetic (two cards tie, order breaks by cardId) and is healed by a
lazy re-rank of the column, never by blocking the user.

### Dates are strings, not timestamps

`dueDate` is a `'YYYY-MM-DD'` string. A timestamp would silently drift across
timezones — a card due "the 5th" must read as the 5th for everyone, and storing an
instant guarantees it eventually reads as the 4th for somebody. Strings make that
class of bug impossible. Comparison and sorting are lexicographic and therefore
free. A single `ORG_TIMEZONE` constant in `@sabeel/shared` defines what "today"
means for overdue highlighting and due-soon reminders; it is the **only** timezone
concept in the app.

## Cross-board "My Work"

This is the phone's default landing screen and the main reason the app beats
opening five boards in turn. It is a **Firestore collection-group query**:

```ts
collectionGroup('cards')
  .where('assigneeUids', 'array-contains', uid)
  .where('archived', '==', false)
  .orderBy('dueDate')
```

Two things follow, and both are why this had to be decided before Phase 2 rather
than bolted on later:

**1. Assignees must be board members (rules-enforced).** A collection-group query
cannot cheaply consult each card's parent board to check membership, so the read
rule keys on the card itself: you may read a card if you are in its
`assigneeUids`. That is only coherent if assignment implies membership — so a
write adding someone to `assigneeUids` is rejected unless they are in the parent
board's `memberUids`.

This constraint pays for itself twice. It also means **every board named in My
Work is already a board the user belongs to**, so the client has all the board
names from its own board list. No `boardName` denormalized onto every card, and no
fan-out trigger rewriting thousands of cards when a board is renamed.

**2. Removing someone from a board must unassign them.** Otherwise their read
access to those cards survives via the assignee rule. Board-member removal is
therefore a **callable**, not a raw client write: it removes the uid from
`memberUids` and strips it from every card's `assigneeUids` in one batch, and the
UI warns how many cards will be unassigned.

Required composite index: collection group `cards` on
`(archived, assigneeUids array-contains, dueDate)`. The emulator will not enforce
this — verify in production (see `docs/INHERITED-STACK.md`, lesson 6).

## Why markdown, not a rich-text editor

Researched 2026-07-19, because "rich text is solved in React" deserved checking.

- **On web it is solved** — TipTap, Lexical, Slate and Quill all have first-class
  React 19 support.
- **On React Native it is not.** Expo's own documentation states there is "no
  one-size-fits-all solution for rich text editing in React Native" and that "no
  widely used packages exist". TipTap's maintainers say ProseMirror will not
  support RN natively, since it depends on browser DOM observers.
- Every viable native option therefore runs the editor **in a WebView**
  (`@10play/tentap-editor`, `react-native-cn-quill`, or Expo DOM components).
  Expo documents this as carrying "a performance and UX penalty", and DOM
  components add async-only function props, no `children`, and no OTA updates.
- `react-native-enriched-html` is genuinely native and good, but has **no web
  support** — disqualifying, since web is a first-class surface here.

So the choice was not "hard to build" but "the phone's editor is a browser inside
an app, forever". Markdown in a native `TextInput` keeps every surface native. A
formatting toolbar (bold, italic, list, link, heading) inserts the syntax so
nobody types `**` by hand, and the rendered view is what people mostly look at.

Storage is the markdown **source string**. It searches directly, diffs cleanly,
imports from ClickUp without fidelity games, and — importantly — remains readable
by a TipTap-based editor if this decision is ever revisited. Render with a
markdown component on both platforms; **sanitize on render** and never allow raw
HTML through.

## Search

Firestore has no full-text search, and adding Algolia/Typesense would mean a third
-party service, a sync pipeline and ongoing cost — exactly the machinery this
project exists to avoid. So search is **client-side, scoped to the boards you
belong to**:

- Fan out one lightweight query per member board, fetching `title`, `description`,
  `columnId` and `dueDate`; match case-insensitive substrings on title and
  description; group results by board.
- The persistent local cache makes repeat searches essentially free and lets
  search work offline over boards already visited.
- Honest limits: it matches substrings, not stems or fuzzy spellings, and it costs
  reads proportional to your card count. Fine for a few thousand cards across
  <50 people. **Revisit past roughly 10,000 cards** — at that point the answer is
  a proper search service, not a cleverer client.

## Bulk actions

Multi-select exists both for its own sake and because column deletion is blocked
until a column is empty — clearing a stale column of 40 cards must not be 40
separate gestures.

- **Web:** checkbox on card hover; click, then shift-click for a range.
- **Phone:** long-press a card to enter selection mode, then tap to add.
- Actions: **move to column**, **archive**, **delete**, **assign**.
- Writes go through a batch; a bulk move assigns fresh ranks so selection order is
  preserved at the destination.
- Delete asks for confirmation and names the count. Archive does not — it is
  reversible from the archive view.

## Offboarding a user

Disabling an account and removing someone from a board are **deliberately
separate actions** with different consequences:

- **Disable** (admin, org-wide): the user can no longer sign in. Their card
  assignments **stay** — nothing silently loses its owner. They render greyed with
  an "inactive" marker wherever they appear, and managers get a review list of
  that person's open cards to reassign at their own pace.
- **Remove from board** (manager/admin): strips them from `memberUids` **and**
  unassigns them from that board's cards, because the assignee read-rule would
  otherwise leave them access. This is the callable described under My Work.

The two stay consistent: a disabled user is still a board member, so the
"assignees must be board members" invariant holds. They simply cannot read
anything, since every rule requires `status == 'active'`.

## Board list and navigation

With no board cap, the list is the thing that degrades first. Structure without
curation overhead:

1. **Favorites** — user-starred, pinned to the top (`favoriteBoardIds`).
2. **Recents** — last 10 opened (`recentBoardIds`, on the user doc so it syncs
   between phone and web).
3. **Everything else** — alphabetical, with a filter box.

No folders or groups: they need curation, a permission story of their own, and a
second tree to navigate on a phone. Revisit only if the team passes ~50 boards and
the flat list genuinely hurts.

On mobile this is the board-switcher bottom sheet; on web, the sidebar.

## Theming

Light and dark, following the OS setting, with **no manual override** in v1.

This is a **Phase 0 obligation, not polish**. Every color goes through semantic
tokens (`bg.surface`, `text.muted`, `border.subtle`, `priority.high`) from the
first screen. Retrofitting dark mode after fifteen screens have hardcoded colors
is a genuinely miserable, error-prone job; doing it from the start costs almost
nothing. Label colors are the one user-chosen palette, so pick swatches that stay
legible on both backgrounds.

## Activity history

A Firestore trigger on card writes diffs before/after and appends one entry per
change to `cards/{id}/activity`. Shown on the card detail screen below the
comments, newest first.

- Clients cannot write activity at all — the log is trustworthy by construction.
- Field edits that carry no meaning for others (rank-only changes from a reorder)
  are **not** logged; a column change is. Otherwise a busy board's history is
  100% noise and nobody reads it.
- Retention matches cards: kept indefinitely.

## Rules invariants

Deny-by-default.

- Board read/write requires `status == 'active'` **and** (`role in [manager,
  admin]` or `uid in board.memberUids`).
- A column may not be removed from `board.columns` while any card references it.
- **Card delete requires `role in [manager, admin]`.** Members may only set
  `archived: true`. Applies to bulk operations identically.
- `users/{uid}/notifications` is trigger-written; the client may only flip `read`.
- Board create / settings / membership / archive: `role in [manager, admin]`.
- `columnId` on a card must match a column that exists on the board — clients
  cannot invent columns.
- **Every uid in a card's `assigneeUids` must be in the parent board's
  `memberUids`.** Load-bearing for My Work — see above.
- A card is also readable by anyone in its own `assigneeUids`, which is what makes
  the collection-group query legal without a parent lookup.
- No client may write their own `role` or `status`; both are claims, set only by
  the admin-only `setUserAccess` callable.
- Comment `authorUid` must equal `request.auth.uid`; edits restricted to the
  author; deletes to the author, a manager, or an admin.
- **`activity` is read-only to all clients** — trigger-written only.

## Notifications

Push via FCM (`expo-notifications`), with a **per-user preference toggle for every
event type** and a **per-board mute**. Notification noise is the fastest way for
this app to become as annoying as the thing it replaced, so the default set is
deliberately small:

| Event | Who gets it | Default |
|---|---|---|
| You were @mentioned in a comment | the mentioned user | on |
| A card was assigned to you | the new assignee | on |
| A comment on a card assigned to you | the assignees | on |
| A card assigned to you is due soon | the assignees | on |
| A card assigned to you was moved | the assignees | **off** |
| A new user is awaiting approval | all admins | on |

Everything is opt-out per event, plus mute-this-board (`mutedBoardIds` on the user
doc). Nothing notifies the actor about their own action. **Confirm this list
before the notifications phase** — it's the one area where I've proposed rather
than been told.

**Delivery is push + an in-app inbox.** Every notification is written to
`users/{uid}/notifications` by the same trigger that sends the push, so a
dismissed or missed push is never lost — there's a badge and a list. The client
may only flip `read`; it can neither create nor edit entries.

There are no watchers: you are notified because a card is assigned to you or
someone @mentioned you. A manager wanting to track a card assigns themselves
alongside the doer.

Due-soon timing and timezone need a decision at Phase 8. The time tracker's
work-local timezone machinery is deliberately NOT being copied; due dates are
expected to be all-day dates in a single org timezone.

## Offline

"Offline depth" means: how much still works with no signal, and what happens to
edits made while offline.

- **Web (v1):** Firestore's persistent local cache (IndexedDB), with the
  multi-tab manager. A board opened before losing signal still renders after a
  reload, and queued writes survive.
- **Android (v1): memory cache only — corrected 2026-07-19.** The earlier plan
  said "persistent cache on both surfaces"; that is **not achievable** with the
  Firebase JS SDK on React Native, because `persistentLocalCache` requires
  IndexedDB and React Native has none. So on Android, offline means "keeps
  working while the app stays open, and syncs queued writes on reconnect" — it
  does **not** survive an app restart.

  Auth persistence *is* handled (AsyncStorage), so people stay signed in across
  restarts; it is only the Firestore cache that is in-memory.

  If restart-surviving offline on Android becomes a real requirement, the honest
  options are react-native-firebase (a native SDK with real persistence, but it
  has no web support, so it would mean two Firebase clients) or a local mirror of
  our own. Both are big; neither is worth doing before the team reports needing it.
- **Not in v1:** a conflict-resolution UI. If two people edit the same card while
  one is offline, last-write-wins silently. For a <50-person team with
  card-per-document granularity this is very unlikely to bite; building a merge UI
  before anyone has hit the problem is exactly the bloat we're avoiding.

## Mobile design (the differentiating surface)

```
┌─────────────────────┐
│  Board ▾      ⚙ 🔍  │   board switcher, settings, search
├─────────────────────┤
│  ◀  In Progress  ▶  │   swipe or tap arrows between columns
│      (2 of 5)       │   position indicator
├─────────────────────┤
│ ┌─────────────────┐ │
│ │ Fix signup flow │ │   full-width card: title, priority dot,
│ │ 🔴 Fri  @faisal │ │   due date, assignee avatars
│ └─────────────────┘ │
│ ┌─────────────────┐ │
│ │ Draft newsletter│ │
│ │ 🟡 Mon  @sara   │ │
│ └─────────────────┘ │
│         + Add       │
└─────────────────────┘
```

- **Swipe horizontally** to change column; the column header shows position so the
  board's shape stays legible.
- **Card move** is a "Move to…" sheet from the card (long-press or detail screen),
  not a drag — dragging across a swipe-paged surface is ambiguous and error-prone.
- **Reorder within a column** is a long-press drag on the vertical list only.
- Card detail is a **full screen**, not a modal; comments live at the bottom of it.
- Board switcher is a bottom sheet listing the user's boards.

## Phases

Full detail, scope and exit criteria live in **`docs/PHASE_STATUS.md`**, which is
also the live build tracker. Summary:

| Phase | What |
|---|---|
| 0 | Monorepo scaffold, CI green, theme tokens + light/dark, hello screen both surfaces |
| 1 | Google auth (domain-restricted) + admin approval + role management |
| 2 | Boards: CRUD, membership, rules + rules tests |
| 3 | Columns + cards: create, edit, move, `rankBetween`, web drag-and-drop |
| 4 | Mobile board: swipe columns, move sheet, card detail screen |
| 5 | Card richness: markdown + toolbar, assignees, due date, priority, labels |
| 6 | **My Work** cross-board view + collection-group index |
| 7 | Multi-select + bulk actions |
| 8 | Comments + @mentions |
| 9 | Activity history |
| 10 | Push notifications + in-app inbox + preferences |
| 11 | Global search + filters + archive view |
| 12 | Polish, user manual, deploy readiness |
| 13 | First production deploy |
| 14 | ClickUp import into production, then open the app to the team |

Phases 3–4 are the technical core; do not let later phases start until card
ordering is correct under concurrent edits **and tested under injected latency**
(see `docs/INHERITED-STACK.md`, lesson 5 — this is precisely the bug shape that
burned the time tracker).

Note the ordering fix: the ClickUp import runs **after** the production deploy,
against the real project, and **before** the team is onboarded — it needs somewhere
real to write, and it must not race live user activity.

## Migration from ClickUp

A **one-time, dev-side, human-in-the-loop** tool — `scripts/import-clickup.mjs`.
It runs as a **setup step before the app is opened to users**, so it never has to
reconcile against live data, and it never ships in the app.

The mapping is genuinely fuzzy: ClickUp usernames won't match Google accounts,
board and list names are getting renamed as part of the move, and statuses map
imperfectly onto columns. So the import runs in three stages:

1. **Extract** — Faisal exports from ClickUp (CSV or API). The script reads it and
   emits a `migration/mapping.json`: every distinct ClickUp user, list, status and
   board name it found, each with a proposed target and a confidence note.
2. **Reconcile** — Claude proposes the fuzzy mappings (user → `@oursabeel.com`
   account, ClickUp list → board name, status → column), Faisal reviews and edits
   the file. This is a conversation, not an algorithm. Unmapped entries are hard
   errors, not silent drops.
3. **Apply** — the script writes to Firestore via the Admin SDK. **Dry-run by
   default** (`--apply` to commit), idempotent via a stable `sourceId` on each
   imported card so a re-run updates rather than duplicates.

Cards import with their title, description, assignees, due date, priority and
comments where the export carries them. Attachments are out of scope entirely.
Anything the script cannot map is reported, never guessed at.

## Open questions

- **Notification event list** — proposed above, needs Faisal's confirmation before
  the notifications phase.
- **Due-soon timing** — how many days ahead, and what hour does the reminder fire?
  Needs `ORG_TIMEZONE` pinned too.
- **Board privacy from managers** — currently impossible by design. Flagged in
  case the team has a board that needs it.
- **Duplicating a board / board templates** — worth it if the nonprofit runs
  repeating programs with the same column structure. Not currently planned.

## Small calls made without asking

Reversible, low-stakes, and not worth a round trip — flag any you dislike:

- **New boards start with To Do / In Progress / Done**, all renameable and
  removable. A blank board is a worse first run than a wrong-but-editable one.
- **Priorities are none / low / medium / high / urgent**, shown as a colored dot
  on the card face and never as a sort default.
- **Boards are archived, never hard-deleted.** Archiving hides a board from
  everyone's list and is admin-reversible; a board is far too much accumulated
  work to expose a destroy button for. (Cards are different — they're small, and
  a bad import needs purging.)
- **Comments are editable by their author, deletable by author/manager/admin**,
  with an "edited" marker.
- **No @channel / @board-wide mention.** Mentions target individuals only.
