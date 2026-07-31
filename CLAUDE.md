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
- **The team is in Houston — `ORG_TIMEZONE` is `America/Chicago`.** It shipped as
  `America/New_York` and nothing surfaced it: due dates are all-day strings, so
  the only symptoms were cards turning overdue an hour early and the due-soon
  reminder firing at 07:00 local. Do not "align" it with the sibling
  time-tracker — that project has no org timezone at all, by design, because it
  buckets each entry in the timezone where the work happened.
- **Three org-wide roles: admin / manager / member.** Managers create boards and
  may join any board; members see only boards they've been added to; admins alone
  approve accounts and promote people. There are NO per-board roles.
- **Sign-in is restricted to `@oursabeel.com` AND still needs admin approval.**
  The domain check is server-side — the client `hd` hint is UX, not a boundary.
- **File attachments exist, and the shape of them is settled** (added 2026-07-26,
  reversing the original "no attachments" decision). Multiple files per card,
  **10 MB each**, any type. **Any active member of the board may remove one** —
  deliberately NOT the manager-only gate permanent card deletion uses, because
  attaching the wrong file is an ordinary mistake that should not need someone
  else to undo. Plain rows, no inline previews. Attach and remove are both
  recorded in the card's activity log.
- **Storage rules cannot read Firestore, and everything about attachments
  follows from that.** Board membership is a Firestore document, so
  `storage.rules` can only ask "is this an active account". Therefore: the
  attachment DOCUMENT is the upload's authorization (creating it is
  membership-checked, and the object goes to a path derived from ids only that
  create could produce); objects are **write-once and unreadable**; every
  download is a short-lived **V4 signed URL** minted by a callable that repeats
  the membership check. Never `getDownloadURL()` — its token never expires, so
  anyone who saw a link would keep access after leaving a board. Clients cannot
  update or delete an attachment: a client delete would strand the bytes, and a
  delete trigger cannot name who did it.
- **Two accepted residuals on attachments, both measured, neither a bug to
  re-fix.** A signed URL already handed out keeps working for up to an hour
  after someone is removed from a board — individual signed URLs cannot be
  revoked, only the signing key rotated, which would kill every URL at once.
  And there is **no cap on how many files a card may hold**: the 10 MB limit is
  per file, so cost is bounded only by the budget alert. Both are fine for
  fewer than fifty colleagues; neither survives contact with untrusted users.
- **Descriptions and comments are MARKDOWN, restricted to FIVE elements**
  (changed 2026-07-30, reversing the 2026-07-20 plain-text decision on the
  explicit request that decision named). Bold, italic, bullet list, ordered
  list, link. **Nothing else** — no headings, code, quotes, underline,
  strikethrough, tables or checklists, and no images because attachments cover
  those. The vocabulary is small because the team's real content needed nothing
  more (measured, not assumed) and because a small vocabulary is what makes the
  round trip provable. `packages/shared/src/richtext.ts` is the one definition;
  `RICH_VOCABULARY` is the list.
- **Markdown is storage the user never sees.** Both editors are WYSIWYG with a
  toolbar. Nobody types syntax — that was the whole objection to markdown in
  2026-07-20 and it still stands.
- **ESCAPING IS THE CORRECTNESS CORE, not a detail.** The escape set is exactly
  the parse set: `\`, `*`, `[` and a line-leading `-`/`+`/`N.`. Deliberately NOT
  `_`, backtick or `~` — outside the vocabulary, so escaping them would store
  `snake\_case\_name`, noise in a field a backfill script will one day read.
  The hand-written list is **not** the correctness criterion; the criterion is
  `parseRich(serializeRich(doc))` equalling `doc`, enforced by seeded fuzz. Add
  a character to one list and you must add it to the other.
- **Autolinking of bare URLs is RENDER-TIME ONLY.** Storage keeps exactly what
  was typed. If either editor rewrote a bare URL, the same keystrokes would
  store different bytes on a phone than in a browser — which is why
  `linkRegex={null}` on native and no AutoLink plugin on web.
- **The editor is the ONLY thing split by platform.** Lexical on web,
  `react-native-enriched-html` on Android, both behind one markdown-in/
  markdown-out contract and one `richtextHtml` seam. The renderer, toolbar,
  mention policy and converter are shared — `RichText` in particular must never
  gain a `.web` sibling, or the two surfaces could disagree about what a card
  says. `docs/RESEARCH-RICH-TEXT.md` records why, and what the spike measured.
- **Labels are ORG-WIDE, not per board** (changed 2026-07-27). One `labels/{id}`
  collection every board shares; a card's `labelIds` mean the same thing
  wherever the card is, so a cross-board move and copy **carry them** — the old
  code cleared them and must not come back. **Any active member creates** one
  (from the `+` in a card's label picker, since Board Settings is manager-only);
  **managers rename, recolour and delete**. Deleting is a callable that strips
  the id from every card first and only then removes the document — reversed,
  a failure would leave cards pointing at nothing findable. A COLLECTION rather
  than an array on a config doc: concurrent creates are the normal case here,
  and an array field would lose writes. Uniqueness is case-insensitive and
  client-checked only; a simultaneous double-create making two same-named labels
  is an accepted residual.
- **Assignees must be board members**, rules-enforced. This is what makes the
  cross-board "My Work" collection-group query legal without a parent lookup —
  breaking it breaks My Work's security model.
- **No WIP limits, no card start dates.** Both considered, both declined.
- **Subscribing to a card means subscribing to its COMMENTS** (added 2026-07-28,
  narrowing the older "no watchers" decision rather than overturning it). Nothing
  else about the card notifies a subscriber — notifying on every change was
  considered and dropped, because `myCardMoved` already ships off for firing
  constantly and ten more triggers beside it would be worse. Assignees are
  unchanged; an assignee may also subscribe, which is how the interest survives
  being unassigned. **`subscriberUids` is a grant of READ** — the card read rule
  has a subscriber arm so the cross-board query needs no per-row board lookup —
  so it carries every constraint `assigneeUids` does: members only, cleared by
  `removeBoardMember`, filtered on a cross-board move, and absent from a copy.
- **BRAND COLORS ARE FIXED.** `docs/BRAND.md` is the authority — it restates the
  designer's **Option 1** palette (2026-07-21), which **supersedes** the older
  `docs/brand/sabeel-color-usage-guide.jpg` (kept for history only). The same
  palette is shared exactly with the sibling time-tracker. **Consult BRAND.md
  before ANY design or color decision** — new screens, components, illustrations,
  charts, anything. Warm Ivory `#F6EBDD` (foundation) / Soft Sage `#A8B89A`
  (calm) / Dark Raspberry `#83114F` (brand identity, used with purpose) / Antique
  Gold `#C6A15B` (sparingly) / Mushroom Taupe `#A58D7A` (support). The
  `Caption`-vs-`Hint` question BRAND.md raised is **settled and applied**:
  `Caption` is only for text you could delete without losing information, 35
  sites moved to `Hint`, seven genuinely disposable ones stayed, and `Body`'s
  `muted` variant was **removed** rather than left unused. `text.muted` itself is
  deliberately NOT darkened — that would collapse it into `text.secondary`.
- **Ordinary actions are icons, not labelled buttons.** Edit, delete, move,
  archive, assign, close — these have settled conventions, and a full-width
  labelled button for each costs a row of vertical space every time. This was
  got wrong three separate times (comment actions, the description editor, the
  bulk-selection bar) before it was written down, and a fourth on the board
  itself (`‹ Prev`/`Next ›` and a per-row "Restore to the board"). Give every
  icon an `accessibilityLabel` carrying the word it replaces. Use `IconAction`
  in `components/ui.tsx`, which lays out a real **44x44 box** — deliberately NOT
  `hitSlop`, because neighbouring slops overlap and the touch goes to whichever
  one the platform feels like. **Reserve labelled buttons for the primary action
  of a screen** — `+ Add card` is the board's, so it keeps its label while
  everything beside it is an icon.
- **A destructive action needs a CONFIRMATION, not a label** (narrowed
  2026-07-30). An icon plus "are you sure" is safer than a labelled button with
  nothing behind it: permanent delete in the archive shipped as a bare labelled
  button that fired on first tap, one row away from Restore. Confirm, then the
  icon is free to match every other row action.
- **Back is ALWAYS the `arrow-back` icon, labelled `Back`, in the header row.**
  Never the word. `Screen` is layout-only and every screen hand-rolls its header,
  so nothing enforces this — it was split 7 icons to 7 words before it was
  written down. A control that RESETS to a root instead of popping one screen is
  a different action and gets a different name (`All boards`, `Inbox`), which
  also keeps `getByRole('button', { name: 'Back' })` unambiguous.
- **A control that floats over content must fit on one row.** The bulk bar sits
  on top of the board: every row it takes is a row of board the user cannot see.
- **All color goes through semantic theme tokens.** The app is a **single light
  theme — no dark mode** (decided 2026-07-21; the derived dark palette was
  removed, not disabled). Never hardcode a color; the ESLint rule will reject it.
  `app/src/theme/palette.ts` is the only exception and is where the brand palette
  lives.
- **Boards archive, never hard-delete. Cards can be deleted, but only by
  managers/admins** — members archive.
- **Stats are server-written, manager-gated, and must never be able to break what
  they count.** `recordStat` runs AFTER the primary work commits and never
  rejects: `guardedEvent` rethrows, so a throw inside a trigger retries it, and
  `onCardWritten` writes activity with generated ids — a retry would duplicate a
  card's history rather than repair it. On the attachment paths the counter sits
  inside the existing winner-only transaction branches, never above them. Day
  keys use `ORG_TIMEZONE`. Drift is acceptable only because
  `scripts/backfill-stats.mjs` rebuilds any range from the source documents;
  `bytesRemoved` is the one series that cannot be reconstructed.
- **A live query has THREE states, not two.** `LiveState` reports
  `data: undefined` for loading AND error, so `?? []` claims "there is none of
  this" when the truth may be "we could not find out". Every failure also
  publishes to a global banner `Screen` renders — keep that banner OUTSIDE the
  scroll container, or it is invisible to anyone scrolled down. Where the value
  is a figure someone might act on, branch on `status` explicitly.
- **Every active filter must be visible and removable, even a broken one.** An id
  can outlive what it points at (a deleted label, an archived board), and
  building chips by filtering a live list down to chosen ids makes a dead id
  vanish from the UI while it keeps narrowing the results — empty screen, no
  cause, nothing to tap.
- **Deliberate view state belongs in `app/src/viewState.ts`, not `useState`.**
  `App.tsx` renders one screen per route, so opening a card unmounts the screen
  behind it. Drafts and busy flags are fine locally; a search, a filter or a
  chosen tab must outlive the unmount or Back returns you to a blank screen.
  Derived updates use the FUNCTIONAL form — two taps in one batch otherwise both
  read the same snapshot and one is lost.
- **A suite nothing invokes is not coverage.** `functions/test/unit/suite-coverage`
  guards the emulator lists and `app/src/ciCoverage.test.ts` guards the e2e ones;
  add to both when adding a suite. `app/` runs plain `.ts` unit tests only —
  anything needing a renderer belongs in an e2e suite.
- **Card ordering is fractional string ranks** in `@sabeel/shared`; a move is one
  document write. Never reintroduce an array-of-ids ordering.

**Stack-level traps live in the `expo-firebase-stack` skill**, in
`../agent-skills/` (public repo), NOT in this one. `docs/STACK-GOTCHAS.md` is a
stub explaining that. When something in this stack costs real time to diagnose,
**write the entry into the skill** — symptom-first — rather than only into a
commit message.

The split is: *would this be true for a different company on the same stack?*
Yes → the skill. No → this file. Nothing naming this project goes into the
skill; the repo is public.

Its closing section, **"How this stack fools you"**, is the one to read before
debugging anything subtle here. The recurring shape is that failures imitate
success: APIs that run and do nothing (`Keyboard` events under edge-to-edge,
RNW's unthemeable `Switch`, an `EXPO_PUBLIC_*` value stale in the Metro cache),
verification steps that counterfeit the result, a green web suite that says
nothing about a native layout bug, and resources that report "deployed" while
not working. **Prove the mechanism ran before concluding a fix was
insufficient, re-test without touching anything, and reproduce on the surface
that is actually broken.**

Sibling project `../sabeel-institute-time-tracker/` is the reference
implementation for every convention here — read its files directly rather than
trusting a summary when the details matter. `docs/INHERITED-STACK.md` records what
carries over and, more importantly, what was learned the hard way there.

## Stack (locked — mirrors the time tracker)

- **Android 13 (API 33) is the floor**, set explicitly in
  `app/android/app/build.gradle` rather than inherited from Expo's default of 24.
  Android 12 and older are unsupported (decided 2026-07-27). That is what lets
  the photo picker be permission-free and both external-storage permissions be
  removed outright — on 13+ the system photo picker needs neither.
- One Expo codebase (`app/`): Android (local Gradle builds, committed `android/`,
  NO iOS, NO EAS) + web via react-native-web (`expo export --platform web` →
  Firebase Hosting). Platform seams as `.web.ts(x)` siblings.
- Firebase **JS SDK on all surfaces** (not react-native-firebase — no web support).
- Backend: Cloud Functions (TS, nodejs22, us-central1) + Firestore + **Cloud
  Storage** (card attachments). The bucket must be a modern
  `*.firebasestorage.app` one in us-central1/us-west1/us-east1 — only those get
  the no-cost quotas. Sentry on web/native/functions.
- Monorepo (npm workspaces): `app`, `functions`, `packages/shared`. Shared types
  and any cross-surface pure logic live in `@sabeel/shared` — the app and
  functions must never each hold their own copy of a rule.
- Google sign-in only, `@oursabeel.com` only; every new account lands `pending`;
  only admins approve/reject/disable users and change roles. Role and status live
  in **custom claims** (rules trust the token), mirrored onto the user doc for UI
  display only.
- Config-as-code: `firestore.rules` / `firestore.indexes.json` / `storage.rules`
  deploy from the repo, never console-edited.
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
  the (light-only) UI and fails on any page error.
- **Every screen at every width: `bash scripts/e2e.sh scripts/screens-e2e.mjs`.**
  Twelve authenticated screens x five widths straddling the breakpoint —
  including a card with the description editor open and one with the comment
  composer in use, because an editor is its own layout — each
  screenshotted to `shots/screens/` AND asserted — sideways scroll, same-layer
  control overlap, a way out of every screen, the right board layout.
  `SWEEP_WIDTHS=320` while iterating. Reach for this on any change to a shared
  component, the theme, or a layout; it is the only check that sees a phone
  layout, and a bug on one side of the breakpoint is invisible from the other.
- Web: `npm run dev:web` (or `scripts/dev.sh web`) — these set
  `EXPO_PUBLIC_USE_EMULATORS=1`. Bare `npx expo start --web` in `app/` does NOT,
  and points at **production Firebase**; nothing in the UI says which backend
  you are on.
- CI (GitHub Actions): lint + typecheck + unit + emulator tests on every push.
  Keep it green. No deploys from CI.

**Verify UI changes by actually looking at a screenshot** (adb for Android,
Playwright for web) — never claim a screen works because the code looks right.

## Secrets (zero tolerance)

- **THIS REPO IS PUBLIC** (confirmed 2026-07-29). Everything committed here —
  including every doc, comment and commit message — is world-readable, and so is
  the entire history: removing something later does not unpublish it. Audited on
  that date and clean, and it stays that way only if the bar below is held.
- **Nothing about the nonprofit's real data or people goes in.** No real names or
  email addresses (the fixtures are `faisal`/`sara`/`omar`, none of which is a
  real account), no board or card contents, and **no production figures** — how
  many admins there are, how many cards were created in a week. Recording that a
  count was *verified* is fine; recording the count is not. Screenshots must come
  from the emulator seed, never a real session.
- NEVER ask for, accept, or echo real API keys/DSNs/tokens in chat; never hardcode
  them. Server secrets: output the exact `firebase functions:secrets:set NAME`
  command for Faisal to run.
- Client-side non-secrets (Firebase web config, `WEB_CLIENT_ID`,
  `google-services.json`, `firestore.rules`) are committed **by design** — rules
  are enforced server-side, so this is security by design, not obscurity.
- Client DSNs go in gitignored `.env.local` (key names only in docs).

## Division of labor

- Agent: all code, rules, indexes, tests, emulator runs, CI, exact click-by-click
  console checklists, diagnosing pasted logs.
- Faisal only: third-party consoles (Firebase/GCP/Sentry), OAuth/SHA-1
  registration, anything with production secrets. He is already comfortable with
  all three consoles — give him precise steps, not tutorials. Everything Faisal
  must do himself is tracked in `TODO.md` — keep it current.

## Conventions

- **The phases are finished and the app is in production.** Work ships as
  numbered releases; commit at the end of a coherent change and work
  autonomously within one. Every release gets an entry in the **deploy log** at
  the top of `docs/PHASE_STATUS.md` — `scripts/publish-apk.sh` pulls the GitHub
  release notes straight from it, so a missing entry fails the publish.
- **The user manual is part of the app.** A change to any screen means
  `docs/USER-MANUAL.md`, then `node scripts/manual-shots.mjs` for its images,
  then `python3 docs/render-manual.py` for the PDF — all three, same batch.
  Add new screens to the generator; an image with no generator goes stale
  unnoticed.
- Before ANY significant install (global/system/major framework), ask first;
  routine project-local npm deps of the locked stack are fine.
- All repo artifacts (docs, plans, protocols) live in this repo.
- User-visible changes ship with their documentation in the same batch as the
  code — never let the manual lag a release.
- Live Firestore reads in `app/src` go through a single `useLiveQuery`/`useLiveDoc`
  module — never hand-roll `onSnapshot` state in a hook (lint-enforced). See
  `docs/INHERITED-STACK.md` for why this is non-negotiable.
- **Deploying needs Faisal's go-ahead** (set 2026-07-25). Do everything up to and
  including the commit, then **stop and show him what is ready** — he says go
  before the web deploy, the APK build and the release. Once he does, ship
  **every** surface in one batch; never ask platform by platform. The gate exists
  because a release is only reversible *forwards*, through another release.
- **Publishing the APK: Release asset, NEVER committed.** The public download is a
  GitHub **Release asset** on the pages repo (`faisal-shah.github.io`), on the
  fixed rolling tag `kanban-latest` — the download URL never changes. Publish with
  `scripts/publish-apk.sh`; it uploads the asset, bumps only the version *label*
  on the page, and asserts the pages repo holds **zero** `.apk` blobs. **Never
  `git add` a binary** to any repo — committing per-release APKs bloated the pages
  history (~31 MB each) and had to be rewritten out. `*.apk` is gitignored in the
  pages repo as the backstop. Same rule holds in the sibling time-tracker.
