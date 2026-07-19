/**
 * End-to-end verification of the Phase 1 access flow, driven through the real
 * web build against the running emulators.
 *
 * The load-bearing assertion is LIVE UN-GATING: after an admin approves someone,
 * their already-open app must let them in WITHOUT a reload or sign-out. That
 * depends on setUserAccess stamping claimsUpdatedAt and session.ts force-
 * refreshing the ID token — a chain no unit test covers, and the exact thing a
 * user would report as "she approved me and nothing happened".
 *
 * Prerequisites (scripts/e2e.sh does both):
 *   - emulators running (firestore, auth, functions)
 *   - an emulator-mode web build in app/dist-web-emu
 *
 *   node scripts/web-e2e.mjs
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';

const SHOTS = resolve(import.meta.dirname, '..', 'shots');
// The Expo web DEV server, started by e2e.sh. It must be the dev server rather
// than an exported bundle: `expo export` sets __DEV__ to false, which correctly
// strips the emulator dev sign-in — the very control this flow needs to drive.
// That the export strips it is asserted separately at the end.
const BASE = process.env.E2E_BASE ?? 'http://127.0.0.1:8086/';
const PROD_BUNDLE = resolve(import.meta.dirname, '..', 'app', 'dist-web');
const PROD_PORT = 4181;

const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
};

/** Serves the exported PRODUCTION bundle, for the dev-row absence check. */
const server = createServer(async (req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  for (const candidate of [join(PROD_BUNDLE, p), join(PROD_BUNDLE, 'index.html')]) {
    try {
      const body = await readFile(candidate);
      res.writeHead(200, {
        'Content-Type': MIME[extname(candidate)] ?? 'application/octet-stream',
      });
      return res.end(body);
    } catch {
      /* fall through to SPA index */
    }
  }
  res.writeHead(404).end('not found');
});

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${name}${detail ? ` — ${detail}` : ''}`);
}

function grantAdmin(email) {
  return new Promise((res, rej) => {
    const child = spawn(
      'node',
      [resolve(import.meta.dirname, 'grant-admin.mjs'), email],
      {
        env: {
          ...process.env,
          GCLOUD_PROJECT: 'demo-sabeel-kanban',
          FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
          FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
        },
        stdio: 'pipe',
      },
    );
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (out += d));
    child.on('exit', (code) => (code === 0 ? res(out) : rej(new Error(out))));
  });
}

async function newApp(browser, scheme = 'light') {
  const ctx = await browser.newContext({
    colorScheme: scheme,
    viewport: { width: 1100, height: 900 },
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.error('   page error:', String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') {
      console.error(`   console.${m.type()}:`, m.text());
    }
  });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  return { ctx, page };
}

/** On failure, show what the screen actually said — guessing wastes runs. */
const pages = new Map();
async function dumpAll() {
  for (const [label, page] of pages) {
    try {
      const text = await page.locator('body').innerText();
      console.error(`\n--- ${label} showed ---\n${text}\n---`);
      await page.screenshot({ path: join(SHOTS, `p1-FAIL-${label}.png`), fullPage: true });
    } catch (e) {
      console.error(`could not dump ${label}:`, String(e));
    }
  }
}

await new Promise((r) => server.listen(PROD_PORT, r));
await mkdir(SHOTS, { recursive: true });

const browser = await chromium.launch();
try {
  // ---- Sign-in screen -----------------------------------------------------
  const { ctx: adminCtx, page: admin } = await newApp(browser);
  pages.set('admin', admin);
  await admin.getByText('Sign in with Google').waitFor({ timeout: 20000 });
  check('sign-in screen renders', true);
  check(
    'dev sign-in row is present in an emulator build',
    await admin.getByText('Dev sign-in (emulator only)').isVisible(),
  );
  await admin.screenshot({ path: join(SHOTS, 'p1-signin-light.png'), fullPage: true });

  // ---- Sign in → pending gate --------------------------------------------
  await admin.getByRole('button', { name: 'faisal', exact: true }).click();
  await admin.getByText('Waiting for approval').waitFor({ timeout: 25000 });
  check('a brand-new org account lands on the pending gate', true);
  await admin.screenshot({ path: join(SHOTS, 'p1-pending-light.png'), fullPage: true });

  // ---- LIVE un-gating ------------------------------------------------------
  // No reload, no re-navigation: the open page must react on its own.
  const urlBefore = admin.url();
  await grantAdmin('faisal@oursabeel.com');
  await admin.getByText('Manage people').waitFor({ timeout: 25000 });
  check('approval un-gates the OPEN app with no reload', admin.url() === urlBefore);
  await admin.screenshot({ path: join(SHOTS, 'p1-home-light.png'), fullPage: true });

  // ---- A second person signs in and waits ---------------------------------
  const { ctx: saraCtx, page: sara } = await newApp(browser);
  await sara.getByRole('button', { name: 'sara', exact: true }).click();
  await sara.getByText('Waiting for approval').waitFor({ timeout: 25000 });
  check('second account also lands pending', true);

  // ---- Admin sees and approves her ----------------------------------------
  await admin.getByText('Manage people').click();
  await admin.getByText('People', { exact: true }).waitFor({ timeout: 15000 });
  await admin.getByText('sara@oursabeel.com').waitFor({ timeout: 20000 });
  check('admin sees the pending person in the approval queue', true);
  await admin.screenshot({ path: join(SHOTS, 'p1-users-light.png'), fullPage: true });

  await admin.getByRole('button', { name: 'Approve' }).first().click();

  // Her open page must un-gate on its own too.
  await sara.getByText('Sabeel Kanban').first().waitFor({ timeout: 25000 });
  await sara
    .getByText('See the boards you have been added to.')
    .waitFor({ timeout: 25000 });
  check('approved member un-gates live and sees member-level capabilities', true);

  const saraSeesAdminTools = await sara.getByText('Manage people').isVisible();
  check('a member does NOT get admin tools', !saraSeesAdminTools);
  await sara.screenshot({ path: join(SHOTS, 'p1-member-home-light.png'), fullPage: true });

  // ---- Domain enforcement, from a real client -----------------------------
  const { ctx: badCtx, page: bad } = await newApp(browser);
  await bad.getByRole('button', { name: 'intruder@gmail.com' }).click();
  // The trigger deletes the account; the client is bounced back to sign-in.
  await bad.getByText('Sign in with Google').waitFor({ timeout: 30000 });
  const stillSignedIn = await bad
    .getByText('Waiting for approval')
    .isVisible()
    .catch(() => false);
  check('non-org account is rejected server-side and never reaches a gate', !stillSignedIn);

  // ---- Dark mode ----------------------------------------------------------
  const { page: darkAdmin } = await newApp(browser, 'dark');
  await darkAdmin.getByText('Sign in with Google').waitFor({ timeout: 20000 });
  await darkAdmin.screenshot({ path: join(SHOTS, 'p1-signin-dark.png'), fullPage: true });
  await darkAdmin.getByRole('button', { name: 'faisal', exact: true }).click();
  await darkAdmin.getByText('Manage people').waitFor({ timeout: 25000 });
  await darkAdmin.getByText('Manage people').click();
  await darkAdmin.getByText('People', { exact: true }).waitFor({ timeout: 15000 });
  await darkAdmin.screenshot({ path: join(SHOTS, 'p1-users-dark.png'), fullPage: true });
  check('dark theme renders the same flows', true);

  // ---- Production-safety: the dev sign-in must NOT survive an export --------
  // `expo export` sets __DEV__ false, which is one of the two conditions gating
  // the emulator sign-in. Asserting it here means the safety property is tested
  // rather than assumed, every run — this is the row that must never reach a
  // release APK or Hosting.
  const prodCtx = await browser.newContext({ viewport: { width: 1100, height: 900 } });
  const prod = await prodCtx.newPage();
  await prod.goto(`http://127.0.0.1:${PROD_PORT}/`, { waitUntil: 'networkidle' });
  await prod.getByText('Sign in with Google').waitFor({ timeout: 20000 });
  const devRowInProd = await prod
    .getByText('Dev sign-in (emulator only)')
    .isVisible()
    .catch(() => false);
  check('exported production bundle has NO dev sign-in row', !devRowInProd);
  await prod.screenshot({ path: join(SHOTS, 'p1-signin-production.png'), fullPage: true });
  await prodCtx.close();

  await adminCtx.close();
  await saraCtx.close();
  await badCtx.close();
} catch (e) {
  console.error('\nE2E aborted:', e instanceof Error ? e.message : String(e));
  await dumpAll();
  process.exitCode = 1;
} finally {
  await browser.close();
  server.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  console.error('FAILED:', failed.map((f) => f.name).join(', '));
  process.exit(1);
}
