import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Every end-to-end suite on disk is actually RUN by CI.
 *
 * The sibling of `functions/test/unit/suite-coverage.test.ts`, and it exists for
 * the same reason that one does: a suite that is never invoked is not coverage,
 * it is a file. `scripts/stats-e2e.mjs` — 271 checks across nine viewport widths
 * — sat green on a laptop and absent from CI for a full release, and nothing
 * anywhere would have said so. The totals do not move, because they were never
 * counted.
 *
 * CI lists its e2e steps one per line by design (each needs its own emulator
 * run), so the list cannot be globbed and has to be kept in step by hand. This
 * is what keeps it honest.
 *
 * Lives in `app/` because that workspace is the one with a test runner wired to
 * plain `.ts`; it asserts about repo files, not about the app.
 */
describe('CI e2e coverage', () => {
  it('runs every scripts/*-e2e.mjs suite', () => {
    // Anchored to THIS FILE, not to the working directory. cwd is the app
    // workspace under `npm test` and the repo root under `vitest --root app`,
    // and a relative path silently resolves to a different place in each — the
    // first version of this test failed with ENOENT rather than reporting on
    // coverage, which is a test failing for a reason unrelated to its subject.
    const repo = resolve(import.meta.dirname, '../..');
    const ci = readFileSync(resolve(repo, '.github/workflows/ci.yml'), 'utf8');
    const onDisk = readdirSync(resolve(repo, 'scripts')).filter((f) =>
      f.endsWith('-e2e.mjs'),
    );

    // Guard the guard: if the glob ever matches nothing, "all of them are in CI"
    // is trivially true and this test would pass while proving nothing.
    expect(onDisk.length).toBeGreaterThan(0);

    const missing = onDisk
      .filter((f) => !LOCAL_ONLY.has(f))
      .filter((f) => !ci.includes(`scripts/${f}`));
    expect(missing, `e2e suites on disk but not run by CI: ${missing.join(', ')}`).toEqual(
      [],
    );
  });

  /**
   * The exemption is itself checked, because an allowlist nobody verifies is how
   * "temporarily local-only" becomes permanent. If one of these ever DOES get a
   * CI step, this fails and the entry must be deleted — the list cannot quietly
   * outlive its reason.
   */
  it('keeps the local-only list honest', () => {
    const repo = resolve(import.meta.dirname, '../..');
    const ci = readFileSync(resolve(repo, '.github/workflows/ci.yml'), 'utf8');
    const onDisk = new Set(
      readdirSync(resolve(repo, 'scripts')).filter((f) => f.endsWith('-e2e.mjs')),
    );

    for (const f of LOCAL_ONLY) {
      expect(onDisk.has(f), `${f} is listed local-only but no longer exists`).toBe(true);
      expect(
        ci.includes(`scripts/${f}`),
        `${f} is now run by CI — delete it from LOCAL_ONLY`,
      ).toBe(false);
    }
  });
});

/**
 * Suites that CANNOT run in CI, with the reason. Everything else must have a CI
 * step; see the test above.
 *
 * `screens-ios-e2e.mjs` drives a booted iOS SIMULATOR through Maestro. That
 * needs macOS with Xcode, a simulator runtime, a debug build installed on it and
 * Metro serving — none of which exist on the Linux runner this project's CI
 * uses, and adding a macOS runner to boot a simulator and build the app for
 * every push is a cost this repo has not chosen to pay. It is run by hand from
 * the Mac that builds iOS: `bash scripts/dev.sh ios && node scripts/screens-ios-e2e.mjs`.
 *
 * This is a deliberate hole, declared rather than hidden. The alternative was
 * naming the file something the glob misses, which would have been the same hole
 * with nothing to read.
 */
const LOCAL_ONLY = new Set(['screens-ios-e2e.mjs']);
