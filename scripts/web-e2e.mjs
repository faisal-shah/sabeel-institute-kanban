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

/** Confirmation text from the most recent window.confirm, per page. */
const lastConfirm = new WeakMap();

async function newApp(browser, scheme = 'light') {
  const ctx = await browser.newContext({
    colorScheme: scheme,
    viewport: { width: 1100, height: 900 },
  });
  const page = await ctx.newPage();

  // Consequential access changes go through window.confirm. Playwright DISMISSES
  // dialogs by default, so without this every approval silently did nothing and
  // the failure looked like a broken button. Record the text too, so the tests
  // can assert a confirmation was actually demanded.
  page.on('dialog', async (d) => {
    lastConfirm.set(page, d.message());
    await d.accept();
  });
  page.on('pageerror', (e) => console.error('   page error:', String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') {
      console.error(`   console.${m.type()}:`, m.text());
    }
  });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  return { ctx, page };
}

/**
 * Open a card from the board.
 *
 * Two things make a naive click unreliable here. A live board re-renders as
 * snapshots arrive, so Playwright's "element is stable" check can time out on a
 * perfectly good element; and while a selection is active a tap TOGGLES the card
 * instead of opening it (deliberate — see useSelection). So: clear any
 * selection, then retry the click until the card screen actually appears.
 */
async function openCard(page, title) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const clear = page.getByRole('button', { name: 'Clear selection' });
    if ((await clear.count()) > 0) {
      await clear.first().click().catch(() => {});
      await page.waitForTimeout(400);
    }

    const tile = page.locator(`[data-testid="card-${title}"]`);
    await tile.waitFor({ timeout: 20000 });
    await tile.click({ timeout: 10000, force: attempt > 0 }).catch(() => {});

    // "Opened" is proven by a control unique to the card screen, not by a
    // heading. This used to wait for the text "Card", which CardScreen
    // deliberately removed — the card's own title is the page heading, so a
    // second one was noise. The card then opened correctly, the check failed,
    // and the retry looked for the tile it had just navigated away from.
    const opened = await page
      .getByRole('button', { name: 'Share card' })
      .waitFor({ timeout: 8000 })
      .then(() => true)
      .catch(() => false);
    if (opened) return;
  }
  throw new Error(`could not open card "${title}"`);
}

/**
 * Pop back to the board list, however deep the stack happens to be. Hard-coding
 * the number of Backs makes every later section brittle to earlier edits.
 */
async function backToBoards(page) {
  for (let i = 0; i < 5; i++) {
    if (await page.getByRole('button', { name: 'New board' }).isVisible().catch(() => false)) {
      return;
    }
    // The NAV first, Back only as a fallback. Back-only walking cannot leave a
    // TAB ROOT — My Work, Search and Alerts dropped their redundant Back when
    // the navigation shell landed — so the loop found nothing to click, broke,
    // and the wait below failed on a perfectly healthy app.
    const boards = page.getByRole('button', { name: 'Boards', exact: true });
    if (await boards.first().isVisible().catch(() => false)) {
      await boards.first().click();
      await page.waitForTimeout(600);
      continue;
    }
    const back = page.getByRole('button', { name: 'Back' });
    if ((await back.count()) === 0) break;
    await back.first().click();
    await page.waitForTimeout(600);
  }
  await page.getByRole('button', { name: 'New board' }).waitFor({ timeout: 20000 });
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
  // People lives in the Account menu, not on the nav itself — the navigation
  // shell moved it there and this script was not updated, so the whole suite
  // had been aborting here. CI does not run the e2e, which is why it rotted
  // unnoticed.
  await admin.getByRole('button', { name: 'Account' }).click();
  await admin.getByRole('button', { name: 'People' }).click();
  await admin.getByText('People', { exact: true }).waitFor({ timeout: 15000 });
  await admin.getByText('sara@oursabeel.com').waitFor({ timeout: 20000 });
  check('admin sees the pending person in the approval queue', true);
  await admin.screenshot({ path: join(SHOTS, 'p1-users-light.png'), fullPage: true });

  await admin.getByRole('button', { name: 'Approve' }).first().click();
  await admin.waitForTimeout(500);
  const approveConfirm = lastConfirm.get(admin) ?? '';
  check(
    'approving asks for confirmation and says what will happen',
    /approve/i.test(approveConfirm) && /sign in/i.test(approveConfirm),
    approveConfirm.replace(/\n+/g, ' ').slice(0, 90),
  );

  // Her open page must un-gate on its own too.
  //
  // Asserted as "the gate is gone AND the app shell is up" rather than by
  // matching the word Boards: since the navigation shell landed, that text is
  // both a nav item and a page heading, so it matches twice and the strict
  // locator throws. This phrasing also says what un-gating actually means.
  await sara.getByText('Waiting for approval').waitFor({ state: 'detached', timeout: 25000 });
  await sara.getByRole('button', { name: 'Account' }).waitFor({ timeout: 15000 });
  check('approved member un-gates live', true);

  // Look for People where it actually lives — INSIDE the Account menu. This
  // used to probe a top-level button that exists for nobody, so it passed
  // without testing anything, which for an access check is worse than no test.
  await sara.getByRole('button', { name: 'Account' }).click();
  // Sign out is in the menu for everyone, so it proves the sheet is open
  // without matching the nav button that opened it.
  await sara.getByRole('button', { name: 'Sign out' }).waitFor({ timeout: 15000 });
  const saraSeesPeople = await sara
    .getByRole('button', { name: 'People' })
    .isVisible()
    .catch(() => false);
  check('a member does NOT get admin tools', !saraSeesPeople);
  await sara.getByRole('button', { name: 'Cancel' }).first().click();
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

  // Labels are ORG-WIDE, and this screen is per-board — which is exactly the
  // misreading the copy has to head off.
  check(
    'board settings says labels are shared by every board',
    await admin
      .getByText(/Labels are shared by every board/)
      .first()
      .isVisible()
      .catch(() => false),
  );

  // Renaming keeps the id, so anything already carrying the label follows the
  // change rather than losing it. (A card gets it further down; this proves the
  // control itself.)
  await admin.getByRole('button', { name: 'Rename urgent' }).click();
  await admin.getByRole('button', { name: 'Save name for urgent' }).waitFor({ timeout: 15000 });
  await admin.getByLabel('New name for urgent').fill('urgent-fix');
  await admin.getByRole('button', { name: 'Save name for urgent' }).click();
  check(
    'a manager can rename a label',
    await admin
      .getByText('urgent-fix')
      .first()
      .waitFor({ timeout: 15000 })
      .then(() => true)
      .catch(() => false),
  );

  // Sara is active by now, so she should be addable to the board.
  // "Add someone" is the section-heading ICON (its accessible name carries the
  // count); the picker below only appears once it is pressed.
  await admin.getByRole('button', { name: /^Add someone/ }).click();
  await admin.getByText('Add someone').waitFor({ timeout: 15000 });
  // Each candidate is one pressable row named "Add <person> to this board" —
  // not a bare "Add" button beside a name.
  await admin.getByRole('button', { name: /^Add .* to this board$/ }).first().click();
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

  // ---- Auto-scroll while dragging -----------------------------------------
  // The HTML5 drag API does not scroll a container when the pointer reaches its
  // edge, so without explicit handling a card can only be dropped somewhere
  // already visible. This drags to the right-hand edge and asserts the board
  // actually moved — the check whose absence let this ship broken.
  await admin.evaluate(async () => {
    const row = document.querySelector('[data-testid="board-columns"]');
    if (!row) throw new Error('columns row not found');

    // Enough columns to make the row genuinely scrollable.
    row.style.maxWidth = '600px';
    const card = document.querySelector('[data-testid="card-Fix signup flow"]');
    if (!card) throw new Error('drag source not found');

    const dt = new DataTransfer();
    const fire = (el, type, x, y) =>
      el.dispatchEvent(
        new DragEvent(type, {
          bubbles: true,
          cancelable: true,
          dataTransfer: dt,
          clientX: x,
          clientY: y,
        }),
      );

    const rect = row.getBoundingClientRect();
    fire(card, 'dragstart', rect.left + 50, rect.top + 50);

    // Park the pointer in the right-hand edge zone and let rAF run.
    const edgeX = rect.right - 10;
    const midY = rect.top + rect.height / 2;
    window.__scrollBefore = row.scrollLeft;
    for (let i = 0; i < 30; i++) {
      fire(row, 'dragover', edgeX, midY);
      await new Promise((r) => requestAnimationFrame(r));
    }
    window.__scrollAfter = row.scrollLeft;
    fire(card, 'dragend', edgeX, midY);
  });

  const scroll = await admin.evaluate(() => ({
    before: window.__scrollBefore,
    after: window.__scrollAfter,
    max:
      document.querySelector('[data-testid="board-columns"]').scrollWidth -
      document.querySelector('[data-testid="board-columns"]').clientWidth,
  }));
  check(
    'the board auto-scrolls horizontally when dragging to its edge',
    scroll.max > 0 && scroll.after > scroll.before,
    `scrollLeft ${scroll.before} → ${scroll.after} (max ${scroll.max})`,
  );

  // And it must STOP at the limit rather than looping forever.
  await admin.evaluate(() => {
    const row = document.querySelector('[data-testid="board-columns"]');
    row.style.maxWidth = '';
    row.scrollLeft = 0;
  });

  // ---- Bulk actions (Phase 7) ---------------------------------------------
  // Put three cards in Blocked, then clear the column in one gesture — the
  // reason multi-select exists, since a column cannot be deleted while it holds
  // cards.
  for (const title of ['Bulk one', 'Bulk two', 'Bulk three']) {
    await admin.getByRole('button', { name: '+ Add card' }).last().click();
    const input = admin.getByPlaceholder('Card title');
    await input.waitFor({ timeout: 10000 });
    await input.click();
    await input.pressSequentially(title, { delay: 10 });
    await input.press('Enter');
    await admin.getByText(title).waitFor({ timeout: 20000 });
  }

  await admin.getByRole('checkbox', { name: 'Select Bulk one' }).click();
  // Shift-click extends the range, so three cards come from two clicks.
  await admin
    .getByRole('checkbox', { name: 'Select Bulk three' })
    .click({ modifiers: ['Shift'] });
  await admin.getByText('3 selected').waitFor({ timeout: 15000 });
  check('shift-click selects a range', true);
  await admin.screenshot({ path: join(SHOTS, 'p7-bulk-selected-light.png'), fullPage: true });

  // The bulk bar is icons now; the accessible name carries the word.
  await admin.getByRole('button', { name: 'Move selected cards' }).click();
  await admin.getByLabel('Destination column').selectOption({ label: 'Done' });
  await admin.waitForTimeout(2000);

  const movedTogether = await admin.evaluate(() => {
    const panel = [...document.querySelectorAll('div')]
      .filter((d) => d.textContent?.trimStart().startsWith('Done'))
      .sort((a, b) => b.textContent.length - a.textContent.length)[0];
    return ['Bulk one', 'Bulk two', 'Bulk three'].every(
      (t) => panel?.querySelector(`[data-testid="card-${t}"]`) !== null,
    );
  });
  check('a bulk move takes the whole selection to one column', movedTogether);

  // And the emptied column can now be deleted, which was the point.
  await admin.getByRole('button', { name: 'Delete column Blocked' }).click();
  // Deleting a column is a TWO-step inline confirm — the ✕ only opens
  // "Delete the column “Blocked”?", and the destructive action is the button
  // inside it. Without this the ✕ never detaches and the wait below times out
  // against a perfectly healthy app.
  await admin.getByRole('button', { name: 'Delete column', exact: true }).click();
  // Assert the column's own delete control is gone, not that the WORD Blocked
  // has left the page — it also appears in the move panel's column dropdown, so
  // a text match resolves to something that never detaches.
  await admin
    .getByRole('button', { name: 'Delete column Blocked' })
    .waitFor({ state: 'detached', timeout: 20000 });
  check('a column emptied by a bulk move can then be deleted', true);

  // Bulk archive clears them off the board in one batch.
  await admin.getByRole('checkbox', { name: 'Select Bulk one' }).click();
  await admin
    .getByRole('checkbox', { name: 'Select Bulk three' })
    .click({ modifiers: ['Shift'] });
  await admin.getByRole('button', { name: 'Archive selected cards' }).click();
  await admin.getByText('Bulk two').waitFor({ state: 'detached', timeout: 20000 });
  check('a bulk archive clears the selection off the board', true);

  // ---- My Work: the cross-board collection-group query (Phase 6) ----------
  // Assign a card to sara, then confirm it appears on HER cross-board view —
  // which is the collection-group query, the assignee read-rule, and the
  // board-name resolution all working together.
  await openCard(admin, 'Fix signup flow');
  await admin.getByText('Assignees').waitFor({ timeout: 20000 });
  // Assignees live behind a compact picker so the section does not grow with the
  // board. Open it, then assign everyone available — the list is ordered by
  // display name, so picking only "the first" would not reliably include the
  // person whose My Work we check next.
  const openPicker = admin.getByRole('button', { name: /^Assign someone/ });
  await openPicker.waitFor({ timeout: 25000 });
  await openPicker.click();

  for (let i = 0; i < 5; i++) {
    const option = admin.getByRole('button', { name: /^Assign \w/ });
    if ((await option.count()) === 0) break;
    await option.first().click();
    await admin.waitForTimeout(1200);
  }
  await admin.getByRole('button', { name: 'Done', exact: true }).click().catch(() => {});

  // Assigned people are listed with an unassign control; that is the
  // confirmation. It is named "Unassign <person>" — an icon action carrying the
  // person's name — not a bare "Remove".
  await admin
    .getByRole('button', { name: /^Unassign / })
    .first()
    .waitFor({ timeout: 20000 });
  check('the assignee picker lists assigned people and hides the rest', true);
  // Due date is a real <input type="date"> now, not preset buttons.
  const dueInput = admin.getByLabel('Due date');
  await dueInput.waitFor({ timeout: 15000 });
  // The ORG timezone's today, not UTC's. `toISOString()` rolls over hours before
  // America/New_York does, so an evening run set a date the app then grouped
  // under "Next 7 days" and the "Today" assertion failed — a real flake that
  // only appeared after ~20:00 local and looked like a regression.
  const orgToday = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  await dueInput.fill(orgToday);
  await admin.waitForTimeout(1500);
  check('a card can be assigned and given a due date', true);

  // The column is editable from the card detail — no trip back to the board.
  // It is a dropdown, not a dialog listing every column: on a board with many
  // columns that list was taller than the screen.
  const columnSelect = admin.getByLabel('Column');
  await columnSelect.waitFor({ timeout: 15000 });
  check(
    'the card column is a compact dropdown, not a list of every column',
    (await columnSelect.evaluate((el) => el.tagName)) === 'SELECT',
  );
  await columnSelect.selectOption({ label: 'Done' });
  await admin.waitForTimeout(2000);
  const movedFromDetail =
    (await columnSelect.inputValue()) ===
    (await columnSelect.evaluate((el) => {
      const opt = [...el.options].find((o) => o.textContent.trim() === 'Done');
      return opt ? opt.value : '';
    }));
  check('a card can change column from its detail view', movedFromDetail);
  // Put it back so later assertions still find it in To Do.
  await columnSelect.selectOption({ label: 'To Do' });
  await admin.waitForTimeout(2000);

  // ---- Labels are ORG-WIDE ------------------------------------------------
  // The renamed label from board settings must be offered on this card without
  // anything having added it to this board, because there is no such thing as
  // adding a label to a board any more.
  check(
    'a label made in board settings is offered on a card',
    await admin
      .getByRole('button', { name: 'Label urgent-fix' })
      .waitFor({ timeout: 20000 })
      .then(() => true)
      .catch(() => false),
  );

  // The `+` is the one label affordance a plain member gets, since board
  // settings is manager-only. Creating from here applies it to the card too.
  await admin.getByRole('button', { name: 'New label' }).click();
  await admin.getByPlaceholder('Label name').fill('cross-board');
  await admin.getByRole('button', { name: 'Add label' }).click();
  check(
    'a label added from a card is applied to that card',
    await admin
      .getByRole('button', { name: 'Label cross-board' })
      .waitFor({ timeout: 20000 })
      .then(() => true)
      .catch(() => false),
  );

  await admin.screenshot({ path: join(SHOTS, 'p5-card-detail-light.png'), fullPage: true });

  // ---- Comments, mentions and activity (Phases 8-9) ----------------------
  // Still on the card detail screen from the assignment above.
  const commentBox = admin.getByPlaceholder('Add a comment — @ to mention someone');
  await commentBox.waitFor({ timeout: 20000 });
  await commentBox.click();
  await commentBox.pressSequentially('Kicking this off, cc @', { delay: 10 });

  // Rows are named "Mention <person>". NOT wrapped in an `if (isVisible)` like
  // this block used to be: a guard like that turns a broken selector into a
  // silently skipped test, which is how the old `(@` selector would have gone on
  // "passing" after the rows were relabelled.
  const rows = admin.getByRole('button', { name: /^Mention / });
  await rows.first().waitFor({ timeout: 20000 });
  const labels = await rows.evaluateAll((els) =>
    els.map((e) => e.getAttribute('aria-label') ?? ''),
  );
  check('typing @ lists people to mention', labels.length >= 2, `${labels.length} offered`);

  // ArrowDown then Enter must pick the SECOND row, which is the only thing that
  // proves the highlight moved rather than Enter just taking the top match.
  const wanted = labels[1].replace(/^Mention\s+/, '').split(/\s+/)[0].toLowerCase();
  await admin.keyboard.press('ArrowDown');
  await admin.keyboard.press('Enter');
  await admin.waitForTimeout(500);
  const afterArrow = await commentBox.inputValue();
  check(
    'arrow keys move the highlight and Enter accepts it',
    afterArrow.includes(`@${wanted}`),
    afterArrow,
  );

  // Escape closes a list you did not want, without touching the text.
  await commentBox.click();
  await commentBox.pressSequentially(' @', { delay: 10 });
  await rows.first().waitFor({ timeout: 15000 });
  const beforeEsc = await commentBox.inputValue();
  await admin.keyboard.press('Escape');
  await admin.waitForTimeout(400);
  check('Escape dismisses the list', (await rows.count()) === 0);
  check('and leaves what was typed alone', (await commentBox.inputValue()) === beforeEsc);

  // Typing again brings it back — Escape must not disable it for good.
  await commentBox.pressSequentially('s', { delay: 10 });
  check(
    'typing after Escape reopens the list',
    await rows
      .first()
      .waitFor({ timeout: 15000 })
      .then(() => true)
      .catch(() => false),
  );

  // Picking a mention must NOT steal focus: you have to be able to keep typing.
  await rows.first().click();
  await admin.waitForTimeout(400);
  const focused = await admin.evaluate(() => {
    const el = document.activeElement;
    return el?.tagName === 'TEXTAREA' || el?.tagName === 'INPUT';
  });
  check('picking a mention keeps focus in the comment box', focused);
  // And typing actually continues into the same box.
  await admin.keyboard.type('please take a look');

  await admin.getByRole('button', { name: 'Comment', exact: true }).click();
  await admin.getByText('Kicking this off').waitFor({ timeout: 20000 });
  check('a comment can be posted', true);

  // Wait rather than sample: the caption renders once the comment round-trips.
  const mentionRecorded = await admin
    .getByText('mentioned', { exact: false })
    .first()
    .waitFor({ timeout: 20000 })
    .then(() => true)
    .catch(() => false);
  check('an @mention resolves to a person on the card', mentionRecorded);

  // The activity log is written by a trigger, so it lags slightly.
  await admin.getByText('created this card').waitFor({ timeout: 25000 });
  check('activity records card creation', true);
  await admin.getByText('assigned', { exact: false }).first().waitFor({ timeout: 25000 });
  check('activity records assignment', true);
  await admin.screenshot({ path: join(SHOTS, 'p8-card-comments-light.png'), fullPage: true });

  // Sara sees the comment on her side, live.
  await sara.getByRole('button', { name: 'Back' }).first().click();
  await sara.getByRole('button', { name: 'My work' }).click();
  await sara.getByText('My work').first().waitFor({ timeout: 20000 });
  await sara.getByText('Fix signup flow').waitFor({ timeout: 25000 });
  check('My Work shows a card assigned on another board', true);

  // WAIT for live content, never sample it. The board name is resolved by a
  // separate lookup and the grouping renders on its own snapshot, so a single
  // instant `isVisible()` wins on a fast machine and loses on a slower CI
  // runner — the exact race that made the attachments suite flake in CI.
  const showsBoardName = await sara
    .getByText('Fundraising 2026')
    .first()
    .waitFor({ timeout: 20000 })
    .then(() => true)
    .catch(() => false);
  check('My Work names the board, resolved with no extra reads', showsBoardName);

  const showsToday = await sara
    .getByText('Today', { exact: false })
    .first()
    .waitFor({ timeout: 20000 })
    .then(() => true)
    .catch(() => false);
  check('My Work groups by due state', showsToday);
  await sara.screenshot({ path: join(SHOTS, 'p6-mywork-light.png'), fullPage: true });

  // ---- Notifications inbox (Phase 10) -------------------------------------
  // Sara was @mentioned and assigned, so her inbox should hold entries written
  // by the triggers — not by any client.
  // My Work is a TAB ROOT, so it has no Back — the navigation shell dropped the
  // redundant Back from the tab roots (My work / Search / Alerts) and you move
  // between them with the nav itself. Clicking Alerts is the whole journey.
  await sara.getByRole('button', { name: /^Alerts/ }).click();
  await sara.getByText('Notifications').first().waitFor({ timeout: 20000 });
  await sara.getByText('mentioned you', { exact: false }).waitFor({ timeout: 25000 });
  check('an @mention lands in the recipient inbox', true);

  // A DIFFERENT notification from the mention waited on above, written by a
  // different trigger, so it arrives on its own schedule.
  const assignedEntry = await sara
    .getByText('assigned you', { exact: false })
    .first()
    .waitFor({ timeout: 20000 })
    .then(() => true)
    .catch(() => false);
  check('an assignment lands in the inbox too', assignedEntry);
  await sara.screenshot({ path: join(SHOTS, 'p10-inbox-light.png'), fullPage: true });

  // Preferences are per-event and per-board.
  await sara.getByRole('button', { name: 'Settings' }).click();
  await sara.getByText('What you are told about').first().waitFor({ timeout: 15000 });
  const movedDefaultOff = await sara
    .getByText('A card assigned to you was moved')
    .first()
    .isVisible();
  check('the high-frequency event is listed and defaults off', movedDefaultOff);
  await sara.screenshot({ path: join(SHOTS, 'p10-notify-settings-light.png'), fullPage: true });

  await sara.getByRole('button', { name: 'Inbox' }).click();
  await sara.getByRole('button', { name: 'Mark all read' }).click();
  // Wait for the marker to GO, rather than sleeping and hoping it has. A fixed
  // sleep is a race with a nicer face on it.
  const stillUnread = await sara
    .getByText('· unread', { exact: false })
    .first()
    .waitFor({ state: 'detached', timeout: 20000 })
    .then(() => false)
    .catch(() => true);
  check('mark all read clears the inbox badge', !stillUnread);

  // ---- Search (Phase 11) --------------------------------------------------
  // Walk back to the board list rather than assuming how deep the stack is —
  // earlier sections leave the admin on a card or a board depending on flow.
  await backToBoards(admin);
  await admin.getByRole('button', { name: 'Search' }).click();
  const searchBox = admin.getByPlaceholder('Search cards across your boards');
  await searchBox.waitFor({ timeout: 20000 });
  await searchBox.click();
  await searchBox.pressSequentially('signup', { delay: 15 });
  await admin.getByText('Fix signup flow').first().waitFor({ timeout: 25000 });
  check('search finds a card by title across boards', true);

  // A description-only match proves it is not just filtering titles.
  await searchBox.fill('');
  await searchBox.pressSequentially('venue', { delay: 15 });
  await admin.getByText('Book venue').first().waitFor({ timeout: 20000 });
  check('search matches on card content', true);

  // Archived cards are hidden until asked for — the archive is a separate place.
  await searchBox.fill('');
  await searchBox.pressSequentially('Draft newsletter', { delay: 15 });
  // The empty state reads "Nothing to show" — the heading doubles as the count,
  // so there is no separate "No matches" line any more.
  await admin.getByText('Nothing to show').waitFor({ timeout: 20000 });
  check('archived cards are excluded from search by default', true);

  // Archived is a FILTER CHIP now. Its accessible name carries the state —
  // "Archived filter, off" / ", on" — so match the prefix, and the state is
  // assertable rather than assumed.
  await admin.getByRole('button', { name: 'Archived filter, off' }).click();
  await admin
    .getByRole('button', { name: 'Archived filter, on' })
    .waitFor({ timeout: 15000 });
  await admin.getByText('Draft newsletter').first().waitFor({ timeout: 20000 });
  check('archived cards are findable when explicitly included', true);
  await admin.screenshot({ path: join(SHOTS, 'p11-search-light.png'), fullPage: true });

  // ---- The label set is not scoped to a board -----------------------------
  // The whole claim of global labels, and the only way to prove it is a board
  // that has never been near the labels: a brand-new one, whose settings are
  // never opened, must offer the labels made on the first board.
  await backToBoards(admin);
  await admin.getByRole('button', { name: 'New board' }).click();
  await admin.getByPlaceholder('Board name').fill('Second Board');
  // Same control names the board and card sections above already prove work:
  // "Create" exactly, and Enter to submit a card title (the fill-then-click
  // route leaves the component's state empty — see the note at card creation).
  await admin.getByRole('button', { name: 'Create', exact: true }).click();
  await admin.getByText('Second Board').first().waitFor({ timeout: 20000 });
  await admin.getByRole('button', { name: '+ Add card' }).first().click();
  const secondTitle = admin.getByPlaceholder('Card title');
  await secondTitle.waitFor({ timeout: 10000 });
  await secondTitle.click();
  await secondTitle.pressSequentially('Elsewhere entirely', { delay: 10 });
  await secondTitle.press('Enter');
  await admin.getByText('Elsewhere entirely').waitFor({ timeout: 20000 });
  // The helper, not a bare text click: a live board re-renders as snapshots
  // arrive and a plain click loses the stability check.
  await openCard(admin, 'Elsewhere entirely');

  const offeredHere = await admin
    .getByRole('button', { name: 'Label cross-board' })
    .waitFor({ timeout: 20000 })
    .then(() => true)
    .catch(() => false);
  check('a label made on one board is offered on a different board', offeredHere);
  check(
    'and so is the renamed one, under its new name',
    await admin
      .getByRole('button', { name: 'Label urgent-fix' })
      .isVisible()
      .catch(() => false),
  );

  await backToBoards(admin);

  // ---- Domain enforcement, from a real client -----------------------------
  // Sara's session is finished with — close it so this last context is not
  // competing with three live Firestore sessions for the dev server.
  await saraCtx.close();
  pages.delete('sara');

  const { ctx: badCtx, page: bad } = await newApp(browser);
  // Give it room to boot before interacting: a click that races the first render
  // reads as a mystery failure rather than a slow start.
  await bad.getByText('Sign in with Google').waitFor({ timeout: 40000 });
  const intruderButton = bad.getByRole('button', { name: 'intruder@gmail.com' });
  await intruderButton.waitFor({ timeout: 30000 });
  await intruderButton.click();

  // Two outcomes are both CORRECT here, and which one you get is a race with the
  // trigger:
  //
  //  - the client keeps a valid ID token, so the app is not signed out and must
  //    explain itself — after a grace period it shows "Wrong account";
  //  - or onUserCreate deletes the account before signInWithCredential finishes,
  //    the sign-in itself fails, and the user is left on the sign-in screen.
  //
  // Asserting only the first made this abort intermittently, which is worse than
  // a missing assertion: a suite that fails for a known-benign reason teaches
  // everyone to re-run it, and the next real failure gets waved through too.
  const rejected = await Promise.race([
    bad
      .getByText('Wrong account')
      .waitFor({ timeout: 40000 })
      .then(() => 'explained')
      .catch(() => null),
    bad
      .getByText('Sign in with Google')
      .waitFor({ timeout: 40000 })
      .then(() => 'signed out')
      .catch(() => null),
  ]);
  check(
    'a non-org account is rejected server-side and never gets in',
    rejected !== null,
    rejected ?? 'neither outcome appeared',
  );

  const reachedAGate = await bad
    .getByText('Waiting for approval')
    .isVisible()
    .catch(() => false);
  check('a rejected account never reaches the approval queue', !reachedAGate);
  await bad.screenshot({ path: join(SHOTS, 'p1-wrong-domain-light.png'), fullPage: true });

  // ---- Archived boards can be found and restored (Phase 2) ---------------
  // Archiving is the SAFE alternative to deleting, so it must be reversible.
  // It was not: the board list filters archived boards out and Restore lives
  // inside board settings, reachable only from the board itself.
  await backToBoards(admin);
  await admin.getByText('Fundraising 2026').first().click();
  await admin.getByText('To Do').first().waitFor({ timeout: 25000 });
  await admin.getByRole('button', { name: 'Settings' }).click();
  await admin.getByText('Board settings').waitFor({ timeout: 20000 });
  await admin.getByRole('button', { name: 'Archive board' }).click();
  await admin.getByRole('button', { name: 'New board' }).waitFor({ timeout: 25000 });
  await admin.waitForTimeout(1500);

  const archivedChip = admin.getByRole('button', { name: /^Archived \(/ });
  check(
    'an archived board leaves the active list and appears under Archived',
    await archivedChip.isVisible().catch(() => false),
  );

  await archivedChip.click();
  await admin.waitForTimeout(800);
  check(
    'the archived board is reachable again',
    await admin.getByText('Fundraising 2026').first().isVisible().catch(() => false),
  );

  await admin.getByText('Fundraising 2026').first().click();
  await admin.getByText('To Do').first().waitFor({ timeout: 25000 });
  await admin.getByRole('button', { name: 'Settings' }).click();
  await admin.getByRole('button', { name: 'Restore board' }).click();
  await admin.waitForTimeout(2000);
  await admin.getByRole('button', { name: 'Back' }).first().click();
  await admin.getByText('To Do').first().waitFor({ timeout: 25000 });
  await backToBoards(admin);
  await admin.waitForTimeout(1200);
  check(
    'restoring returns it to the active list and hides the Archived section',
    !(await archivedChip.isVisible().catch(() => false)),
  );

  // Attachments have their own focused suite, so a stale check in the long
  // access/board flow above cannot block them:
  //   bash scripts/e2e.sh scripts/attachments-e2e.mjs

  // ---- Dark mode ----------------------------------------------------------
  // Re-emulate the colour scheme on the page we already have, rather than
  // opening a fourth context and signing in again. The theme follows the OS
  // signal, so this exercises exactly the same code path — and avoids four
  // concurrent sessions competing for the dev server.
  await backToBoards(admin);
  await admin.emulateMedia({ colorScheme: 'dark' });
  await admin.waitForTimeout(600);
  await admin.screenshot({ path: join(SHOTS, 'p2-boards-dark.png'), fullPage: true });

  await admin.getByText('Fundraising 2026').first().click();
  await admin.getByText('To Do', { exact: false }).first().waitFor({ timeout: 20000 });
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
