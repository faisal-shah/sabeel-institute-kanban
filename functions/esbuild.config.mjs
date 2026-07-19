// Functions are BUNDLED, not just tsc'd.
//
// `@sabeel/shared` is a private workspace package. Cloud Build only uploads the
// `functions/` directory, so a plain tsc output would deploy an import of a
// package that does not exist up there — the sibling time-tracker project's very
// first deploy failed on exactly this (docs/INHERITED-STACK.md, lesson 1).
// Bundling inlines shared into the output, so there is nothing left to resolve.
//
// firebase-admin / firebase-functions stay external: they are real dependencies
// in package.json and the runtime provides them.
import * as esbuild from 'esbuild';

await esbuild.build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  outfile: 'lib/index.js',
  external: ['firebase-admin', 'firebase-functions', '@sentry/node'],
  sourcemap: true,
  logLevel: 'info',
});
