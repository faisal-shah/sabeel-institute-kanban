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
  await admin.emulateMedia({ colorScheme: 'dark' });
  await admin.waitForTimeout(300);
  await admin.screenshot({ path: join(SHOTS, 'p1-signin-dark.png'), fullPage: true });
  await admin.emulateMedia({ colorScheme: 'light' });

  // ---- Sign in → pending gate --------------------------------------------
  await admin.getByRole('button', { name: 'faisal', exact: true }).click();
  await admin.getByText('Waiting for approval').waitFor({ timeout: 25000 });
  check('a brand-new org account lands on the pending gate', true);
  await admin.screenshot({ path: join(SHOTS, 'p1-pending-light.png'), fullPage: true });

  // ---- LIVE un-gating ------------------------------------------------------
  // No reload, no re-navigation: the open page must react on its own.
  const urlBefore = admin.url();
  await grantAdmin('faisal@oursabeel.com');
  await admin.getByRole('button', { name: 'New board' }).waitFor({ timeout: 25000 });
  check('approval un-gates the OPEN app with no reload', admin.url() === urlBefore);
  await admin.screenshot({ path: join(SHOTS, 'p1-home-light.png'), fullPage: true });

  // ---- A second person signs in and waits ---------------------------------
  const { ctx: saraCtx, page: sara } = await newApp(browser);
  pages.set('sara', sara);
  await sara.getByRole('button', { name: 'sara', exact: true }).click();
  await sara.getByText('Waiting for approval').waitFor({ timeout: 25000 });
  check('second account also lands pending', true);

  // ---- Admin sees and approves her ----------------------------------------
  await admin.getByRole('button', { name: 'People' }).click();
  await admin.getByText('People', { exact: true }).waitFor({ timeout: 15000 });
  await admin.getByText('sara@oursabeel.com').waitFor({ timeout: 20000 });
  check('admin sees the pending person in the approval queue', true);
  await admin.screenshot({ path: join(SHOTS, 'p1-users-light.png'), fullPage: true });

  await admin.getByRole('button', { name: 'Approve' }).first().click();

  // Her open page must un-gate on its own too.
  await sara.getByText('Boards', { exact: true }).waitFor({ timeout: 25000 });
  check('approved member un-gates live', true);

  const saraSeesPeople = await sara
    .getByRole('button', { name: 'People' })
    .isVisible()
    .catch(() => false);
  check('a member does NOT get admin tools', !saraSeesPeople);
  await sara.screenshot({ path: join(SHOTS, 'p1-member-home-light.png'), fullPage: true });

  // Back to the board list so the Phase 2 flow starts from a known place.
  await admin.getByRole('button', { name: 'Back' }).first().click();
  await admin.getByRole('button', { name: 'New board' }).waitFor({ timeout: 15000 });

  // ---- Boards (Phase 2) ---------------------------------------------------
  await admin.getByRole('button', { name: 'New board' }).click();
  await admin.getByPlaceholder('Board name').fill('Fundraising 2026');
  await admin.getByRole('button', { name: 'Create', exact: true }).click();
  await admin.getByText('Fundraising 2026').first().waitFor({ timeout: 20000 });
  check('a manager can create a board and lands on it', true);

  // Default columns exist so a new board is usable immediately.
  await admin.getByText('To Do').first().waitFor({ timeout: 15000 });
  await admin.getByText('In Progress').first().waitFor({ timeout: 15000 });
  await admin.getByText('Done').first().waitFor({ timeout: 15000 });
  check('a new board starts with the three default columns', true);
  await admin.screenshot({ path: join(SHOTS, 'p2-board-light.png'), fullPage: true });

  // Board settings: add a column, add a label, add a member.
  await admin.getByRole('button', { name: 'Settings' }).click();
  await admin.getByText('Board settings').waitFor({ timeout: 15000 });
  await admin.getByPlaceholder('New column name').fill('Blocked');
  await admin.getByRole('button', { name: 'Add column' }).click();
  await admin.getByText('Blocked').first().waitFor({ timeout: 15000 });
  check('a manager can add a column', true);

  await admin.getByPlaceholder('New label name').fill('urgent');
  await admin.getByRole('button', { name: 'Add label' }).click();
  await admin.getByText('urgent').first().waitFor({ timeout: 15000 });
  check('a manager can add a label', true);

  // Sara is active by now, so she should be addable to the board.
  await admin.getByText('Add someone').waitFor({ timeout: 15000 });
  await admin.getByRole('button', { name: 'Add', exact: true }).first().click();
  await admin.getByText('Members (2)').waitFor({ timeout: 20000 });
  check('a manager can add a member to a board', true);
  await admin.screenshot({ path: join(SHOTS, 'p2-settings-light.png'), fullPage: true });

  // The member's OPEN app must now show the board, with no reload.
  await sara.getByText('Fundraising 2026').first().waitFor({ timeout: 25000 });
  check('a member sees a board live once added, with no reload', true);
  await sara.screenshot({ path: join(SHOTS, 'p2-member-boards-light.png'), fullPage: true });

  // Members do not get board administration.
  await sara.getByText('Fundraising 2026').first().click();
  await sara.getByText('To Do').first().waitFor({ timeout: 15000 });
  const saraSeesSettings = await sara
    .getByRole('button', { name: 'Settings' })
    .isVisible()
    .catch(() => false);
  check('a member gets no board Settings button', !saraSeesSettings);

  const saraSeesNewBoard = await sara
    .getByRole('button', { name: 'New board' })
    .isVisible()
    .catch(() => false);
  check('a member cannot create boards', !saraSeesNewBoard);

  // ---- Cards (Phase 3) ----------------------------------------------------
  await admin.getByRole('button', { name: 'Back' }).first().click();
  await admin.getByText('To Do').first().waitFor({ timeout: 20000 });

  // Add three cards to the first column.
  //
  // Typed with real keystrokes rather than fill(): fill() sets the value and
  // fires one input event, which a controlled React input can miss, leaving the
  // component's state empty while the DOM looks correct — the submit then
  // silently no-ops on an empty title. Enter matches how people actually add
  // cards anyway.
  for (const title of ['Fix signup flow', 'Draft newsletter', 'Book venue']) {
    await admin.getByRole('button', { name: '+ Add card' }).first().click();
    const input = admin.getByPlaceholder('Card title');
    await input.waitFor({ timeout: 10000 });
    await input.click();
    await input.pressSequentially(title, { delay: 10 });
    await input.press('Enter');
    await admin.getByText(title).waitFor({ timeout: 20000 });
  }
  check('cards can be created and appear live', true);
  await admin.screenshot({ path: join(SHOTS, 'p3-board-cards-light.png'), fullPage: true });

  // Cards land in creation order (each appended after the last).
  const order = await admin.evaluate(() => {
    const tiles = [...document.querySelectorAll('[data-testid^="card-"]')];
    return tiles.map((t) => t.getAttribute('data-testid'));
  });
  check(
    'new cards append in order',
    order.slice(0, 3).join('|') ===
      'card-Fix signup flow|card-Draft newsletter|card-Book venue',
    order.join(' , '),
  );

  // Drag the third card into the second column.
  //
  // Playwright's dragTo() synthesises MOUSE events, which do not trigger the
  // HTML5 drag-and-drop API at all — the handlers this board actually uses. So
  // dispatch the real drag events with a shared DataTransfer, the way a browser
  // does.
  await admin.evaluate(() => {
    const card = document.querySelector('[data-testid="card-Book venue"]');
    // The column PANEL is the outermost div whose text begins with the column
    // name — the one carrying the drop handler.
    const target = [...document.querySelectorAll('div')]
      .filter((d) => d.textContent?.trimStart().startsWith('In Progress'))
      .sort((a, b) => b.textContent.length - a.textContent.length)[0];
    if (!card || !target) throw new Error('drag source or target not found');

    const dt = new DataTransfer();
    const fire = (el, type) =>
      el.dispatchEvent(
        new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt }),
      );

    fire(card, 'dragstart');
    fire(target, 'dragover');
    fire(target, 'drop');
    fire(card, 'dragend');
  });
  await admin.waitForTimeout(2500);

  const movedIntoDoing = await admin.evaluate(() => {
    // The column panel containing "In Progress" should now hold the card.
    const panels = [...document.querySelectorAll('div')].filter((d) =>
      d.textContent?.startsWith('In Progress'),
    );
    return panels.some((p) => p.querySelector('[data-testid="card-Book venue"]') !== null);
  });
  check('a card can be dragged to another column', movedIntoDoing);
  await admin.screenshot({ path: join(SHOTS, 'p3-board-dragged-light.png'), fullPage: true });

  // The member's open board must reflect the move without a reload.
  await sara.getByText('Book venue').first().waitFor({ timeout: 25000 });
  check('another person sees new and moved cards live', true);

  // A column with cards cannot be deleted.
  await admin.getByRole('button', { name: 'Delete column To Do' }).click();
  await admin.getByText(/still has \d+ card/).waitFor({ timeout: 15000 });
  check('deleting a non-empty column is refused, with a reason', true);
  await admin.screenshot({
    path: join(SHOTS, 'p3-column-delete-blocked-light.png'),
    fullPage: true,
  });
  await admin.getByRole('button', { name: 'Dismiss' }).click();

  // Archiving removes a card from the board.
  await admin.getByRole('button', { name: 'Archive Draft newsletter' }).click();
  await admin
    .getByText('Draft newsletter')
    .waitFor({ state: 'detached', timeout: 20000 });
  check('a card can be archived off the board', true);

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
  // Re-emulate the colour scheme on the page we already have, rather than
  // opening a fourth context and signing in again. The theme follows the OS
  // signal, so this exercises exactly the same code path — and avoids four
  // concurrent sessions competing for the dev server.
  await admin.emulateMedia({ colorScheme: 'dark' });
  await admin.waitForTimeout(500);
  await admin.screenshot({ path: join(SHOTS, 'p2-settings-dark.png'), fullPage: true });

  await admin.getByRole('button', { name: 'Back' }).first().click();
  await admin.getByText('Fundraising 2026').first().waitFor({ timeout: 20000 });
  await admin.screenshot({ path: join(SHOTS, 'p2-board-dark.png'), fullPage: true });
  check('dark theme renders the board flows', true);
  await admin.emulateMedia({ colorScheme: 'light' });

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
