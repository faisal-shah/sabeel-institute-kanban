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
const worker = readFileSync(resolve(root, 'app/public/firebase-messaging-sw.js'), 'utf8');
const clientConfig = readFileSync(resolve(root, 'app/src/firebase-config.ts'), 'utf8');

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

// 3. The service worker's Firebase config, mirrored from the client's.
//
//    The worker runs OUTSIDE the app bundle — `importScripts` has no module
//    system — so it cannot import `firebase-config.ts` and duplicates the four
//    fields FCM needs. Its own comment says to keep them in step, and until now
//    that was the whole enforcement.
//
//    Drift here is silent and total, which is why it belongs on the export path
//    rather than in a comment. A wrong `messagingSenderId` or `projectId` means
//    `getToken` mints a token against a different project, or none at all: the
//    build succeeds, the deploy succeeds, permission is granted, and every
//    device reports it cannot receive notifications. That is the exact failure
//    signature `check-web-push.mjs` exists for, reached by a different route —
//    and that check cannot see it, because it reads the BUNDLE and the worker is
//    a separate file the bundler never touches.
const CONFIG_FIELDS = ['apiKey', 'projectId', 'messagingSenderId', 'appId'];
const readField = (text, field) =>
  text.match(new RegExp(`${field}\\s*:\\s*'([^']+)'`))?.[1];

for (const field of CONFIG_FIELDS) {
  const mine = readField(clientConfig, field);
  const theirs = readField(worker, field);
  if (!mine) fail(`could not read \`${field}\` from app/src/firebase-config.ts`);
  if (!theirs) {
    fail(
      `app/public/firebase-messaging-sw.js has no \`${field}\`.\n` +
        '  The worker needs it to reach FCM; without it web push registers nothing\n' +
        '  and every device reports it cannot receive notifications.',
    );
  }
  if (mine !== theirs) {
    fail(
      `service worker config drift: ${field} is '${theirs}' in\n` +
        `  app/public/firebase-messaging-sw.js and '${mine}' in app/src/firebase-config.ts.\n` +
        '  firebase-config.ts wins. Left alone this deploys happily and delivers\n' +
        '  nothing, with no error anywhere.',
    );
  }
}

console.log(
  `web template ok (canvas ${wanted}, #root uses dvh, service worker config agrees)`,
);
