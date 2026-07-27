import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';

/**
 * Every integration suite is actually RUN by one of the two emulator passes.
 *
 * `test:integration:rules` and `test:integration:fn` list their files
 * explicitly, and they have to: the two passes need different emulator sets, and
 * mixing them reintroduces a real flake (see scripts/test-emulator.sh). The cost
 * of that is a new suite being silently skipped — added, green locally, never
 * executed, and the totals look unchanged because they ARE unchanged.
 *
 * That is not hypothetical: it happened to the two label suites in this very
 * commit, and the only clue was the file count not moving.
 */
describe('emulator suite coverage', () => {
  it('runs every file in test/integration', () => {
    // Paths are relative to the functions workspace, which is vitest's cwd —
    // the same way the rules suites read '../firestore.rules'.
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
    const listed = `${pkg.scripts['test:integration:rules']} ${pkg.scripts['test:integration:fn']}`;

    const onDisk = readdirSync('test/integration').filter((f) => f.endsWith('.test.ts'));
    expect(onDisk.length).toBeGreaterThan(0);

    const missing = onDisk.filter((f) => !listed.includes(`test/integration/${f}`));
    expect(missing, `not run by either emulator pass: ${missing.join(', ')}`).toEqual([]);
  });
});
