// Guard the hand-maintained web HTML shell.
//
// `app/public/index.html` overrides Expo's generated template, and it carries two
// things that nothing else can express: the app root sized in `dvh`, and the
// canvas colour painted on html/body. Both were fixes for real, filmed bugs on a
// phone browser — a white band appearing below the app as the address bar
// collapsed, and a board column whose "+ Add card" was pushed off a screen that
// could not scroll.
//
// Neither is protected by the type system, the ESLint colour rule (which only
// looks at TS), or any test, and the file is a copy of a vendor template that
// somebody will eventually re-sync by hand. So assert the load-bearing parts
// here, on the export path — which is also what CI runs.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const html = readFileSync(resolve(root, 'app/public/index.html'), 'utf8');
const palette = readFileSync(resolve(root, 'app/src/theme/palette.ts'), 'utf8');

const fail = (msg) => {
  console.error(`\nweb template check FAILED\n  ${msg}\n`);
  process.exit(1);
};

// 1. The dynamic-viewport height, which is what stops the white band and keeps
//    a pinned control on screen.
if (!/#root[^}]*height:\s*100dvh/s.test(html)) {
  fail(
    'app/public/index.html no longer sizes #root with `height: 100dvh`.\n' +
      '  Without it the app root does not track a mobile browser\'s address bar:\n' +
      '  a bare white strip appears below the app, and pinned controls fall off\n' +
      '  the bottom of a page that cannot scroll (body is overflow:hidden).',
  );
}

// 2. The canvas colour, mirrored from the theme. palette.ts is the source of
//    truth; this file is the copy, so the copy must agree.
const wanted = palette.match(/canvas:\s*'(#[0-9A-Fa-f]{6})'/)?.[1];
if (!wanted) fail('could not read `canvas` from app/src/theme/palette.ts');

const got = html.match(/background-color:\s*(#[0-9A-Fa-f]{6})/)?.[1];
if (!got) fail('app/public/index.html no longer paints a background-color on html/body.');

if (got.toUpperCase() !== wanted.toUpperCase()) {
  fail(
    `background colour drift: index.html has ${got}, palette.ts canvas is ${wanted}.\n` +
      '  Update the HTML to match the theme (palette.ts wins).',
  );
}

console.log(`web template ok (canvas ${wanted}, #root uses dvh)`);
