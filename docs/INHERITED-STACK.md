# Inherited stack — what carries over from the time tracker

Researched from `../sabeel-institute-time-tracker/` on 2026-07-18. This is the
"don't re-derive it" file: concrete shapes to copy, and the expensive lessons that
project already paid for.

## Repo layout to copy

```
sabeel-institute-kanban/
├── package.json               # workspaces: packages/*, functions, app
│                              # prepare/pretypecheck/pretest all build @sabeel/shared first
├── tsconfig.base.json         # strict
├── eslint.config.mjs          # flat config
├── firebase.json              # functions + firestore + hosting(app/dist-web) + emulators
│                              # NO storage / remoteconfig / extensions
├── .firebaserc                # placeholder project id until Faisal creates the real one
├── firestore.rules / firestore.indexes.json
├── CLAUDE.md, README.md, TODO.md, docs/
├── scripts/                   # emulator.sh, test-emulator.sh, web-e2e.mjs, grant-admin.mjs
├── .github/workflows/ci.yml   # lint → typecheck → unit → emulator (JDK 21 + firebase-tools)
├── packages/shared/           # @sabeel/shared — types, constants, pure domain rules
├── functions/                 # nodejs22 TS; esbuild bundle; Vitest unit + rules-unit-testing
└── app/                       # @sabeel/app — Expo, react-native-web
    └── src/{screens,components,auth}/ + platform seams as *.web.ts(x)
```

Emulator ports (from `firebase.json`): auth 9099, functions 5001, firestore 8080,
UI on, `singleProjectMode: true`.

Hosting headers worth copying verbatim: `no-cache, must-revalidate` on `**`, and
`max-age=31536000, immutable` on `/_expo/static/**`.

## Lessons paid for in the time tracker

**1. Functions must be esbuild-bundled.** Cloud Build cannot resolve the private
`@sabeel/shared` workspace package from a plain `tsc` output. `functions/build` =
`tsc --noEmit` (typecheck only) + `node esbuild.config.mjs` (the real bundle).
A first deploy failed on exactly this.

**2. A failed first deploy leaves callables permanently 403.** Gen-2 callables get
their public-invoker IAM binding only on the *create* path. If the first deploy
creates the function but the build fails, later update deploys never re-apply the
binding and every client call bounces at the Cloud Run layer before your code
runs. Fix is `firebase functions:delete <names> --region us-central1 --force` then
redeploy. Watch for this on the kanban project's first deploy too.

**3. First deploy of a Firestore-trigger function often fails on the Eventarc
service agent.** Not a config error — permissions take 2–5 minutes to propagate.
Wait and redeploy just the failed functions.

**4. `expo export` must always `--clear`.** Metro will otherwise happily serve a
cached bundle built under different `EXPO_PUBLIC_*` env — an emulator-mode bundle
must never ship to Hosting.

**5. Never hand-roll `onSnapshot` state in a hook.** This caused a real
data-correctness bug (`docs/POSTMORTEM-2026-07-16-stale-week.md` in the sibling
repo — worth reading in full before writing the kanban equivalent). The
`liveQuery.ts` module encodes two invariants:
   - State **resets to empty** the instant subscription inputs change, so query A's
     results can't linger on screen while query B's first snapshot is in flight.
   - Listener errors also reset to empty and are surfaced in-app *and* to Sentry —
     a server-rejected listen must never die as a console warning nobody sees.

   Corollary: async UI must be e2e-tested at least once **under injected latency**,
   not just at localhost speed. Kanban drag-and-drop makes this sharper, not
   softer — optimistic local moves reconciling against server snapshots is
   precisely the shape of bug that postmortem describes.

**6. The emulator does NOT enforce composite indexes.** Only production can
confirm them. Any change to `firestore.indexes.json` or to a query shape needs a
production probe after deploy.

**7. Rules duplicate domain logic on purpose.** The time tracker recomputes
`periodKey` inside `firestore.rules` so a client cannot stamp a false value to
dodge a lock. Expect the kanban equivalent: any client-supplied field that gates
a permission must be recomputed or constrained in rules, never trusted.

## Auth model to reuse as-is

Google sign-in only → new user lands `pending` → an **admin** approves. Claims
(`role`, `status`, `admin`) are set exclusively by a `setUserAccess` callable and
are what `firestore.rules` trusts; the user doc mirrors them for display. Rules
are deny-by-default with `isSignedIn` / `isActive` / `isManager` / `isAdmin`
helpers. First admin after first deploy is bootstrapped by
`scripts/grant-admin.mjs` via gcloud ADC.

## Resolved during design (2026-07-18)

See `docs/PRODUCT_BRIEF.md` for the full decisions. Deltas from the time tracker:

- **Roles map closely.** The time tracker's member / manager (+ admin flag)
  becomes a flat **member / manager / admin**, and the claims-based account
  approval flow ports essentially unchanged. What's new is a **domain
  restriction** (`@oursabeel.com`) that must be enforced server-side in the
  auth-create function — the client `hd` hint is not a boundary.
- **Card ordering: fractional base-62 string ranks**, one doc write per move.
- **No Storage.** Attachments were considered and dropped, so the time tracker's
  no-Storage `firebase.json` copies over as-is.
- **Timezone machinery is NOT copied.** It was load-bearing for work-local time
  entries; kanban due dates are all-day dates in a single org timezone. Resist
  porting `time.ts` wholesale.
- **Offline:** enable Firestore's persistent local cache (the time tracker did not
  need to); no conflict-resolution UI in v1.
