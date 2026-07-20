# Dead code

```sh
npm run deadcode      # knip: unused files, exports and dependencies
```

Run it before a release. This is a greenfield project with no external
consumers, so **anything unused gets deleted, not deprecated** — code kept
"in case" is a liability, and nothing here is load-bearing for anyone outside
this repo.

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
