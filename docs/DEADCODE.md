# Dead code

```sh
npm run deadcode      # knip: unused files, exports and dependencies
```

Run it before a release. This is a greenfield project with no external
consumers, so **anything unused gets deleted, not deprecated** — code kept
"in case" is a liability, and nothing here is load-bearing for anyone outside
this repo.

## What a clean run looks like

Two **unlisted dependencies** — `expo-updates` and `expo-system-ui`, both
attributed to `app/app.json`. Neither appears in that file; knip's Expo plugin
infers them from Expo's own defaults. Do not install them to quiet the report.

Everything else should be empty. If a category that used to be empty is not,
something changed — and the two most recent examples were both *config* drift
rather than dead code:

- The app workspace gained a test runner, and knip did not know about it, so
  every `app/src/**/*.test.ts` came back as an "unused file". Fixed by listing
  them as entries in `knip.json`.
- `scripts/*.mjs` imported `firebase-admin` while nothing at the root declared
  it — it resolved only because npm hoisted it out of `functions/`. Every
  backfill and migration script rested on that. Now declared at the root.

**A workspace that uses a package must declare it**, even in a monorepo that
hoists. Hoisting is a resolution accident, not a dependency.

## Two things knip gets wrong here, and one you must not "fix"

**Platform seams.** `Foo.web.tsx` is resolved by the bundler, not by an import,
so knip sees those files as unreachable. `knip.json` lists them as entry points.
If you add a new seam, nothing breaks — but knip will start reporting its web
half as unused until the glob covers it.

**Symbols used only from a `.web.tsx`.** knip can report an export as unused
when its only consumer is a platform file. `rerankColumnIfNeeded` was deleted on
exactly that basis and the compiler caught it immediately. **Grep across `.ts`
AND `.tsx`, then typecheck, before believing the report.**

**`@sabeel/shared` will be listed as an "unlisted dependency" of `functions`.
That is deliberate — do NOT add it back.** It is bundled into
`functions/lib/index.js` by esbuild, and listing it in `functions/package.json`
makes Cloud Build try to install a private package from the public registry,
which fails the deploy (`docs/INHERITED-STACK.md` lesson 3b). It is in
`ignoreDependencies` so the report stays quiet, and this paragraph exists so the
next person does not "helpfully" restore it.
