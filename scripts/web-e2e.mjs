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
    const clear = page.getByRole('button', { name: 'Clear' });
    if ((await clear.count()) > 0) {
      await clear.first().click().catch(() => {});
      await page.waitForTimeout(400);
    }

    const tile = page.locator(`[data-testid="card-${title}"]`);
    await tile.waitFor({ timeout: 20000 });
    await tile.click({ timeout: 10000, force: attempt > 0 }).catch(() => {});

    const opened = await page
      .getByText('Card', { exact: true })
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
  await admin.getByText('3 cards selected').waitFor({ timeout: 15000 });
  check('shift-click selects a range', true);
  await admin.screenshot({ path: join(SHOTS, 'p7-bulk-selected-light.png'), fullPage: true });

  await admin.getByRole('button', { name: 'Move to…' }).click();
  await admin.getByRole('button', { name: 'Done', exact: true }).click();
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
  await admin
    .getByText('Blocked')
    .first()
    .waitFor({ state: 'detached', timeout: 20000 });
  check('a column emptied by a bulk move can then be deleted', true);

  // Bulk archive clears them off the board in one batch.
  await admin.getByRole('checkbox', { name: 'Select Bulk one' }).click();
  await admin
    .getByRole('checkbox', { name: 'Select Bulk three' })
    .click({ modifiers: ['Shift'] });
  await admin.getByRole('button', { name: 'Archive', exact: true }).click();
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

  // Assigned people are listed with a Remove control; that is the confirmation.
  await admin.getByRole('button', { name: 'Remove' }).first().waitFor({ timeout: 20000 });
  check('the assignee picker lists assigned people and hides the rest', true);
  await admin.getByRole('button', { name: 'Today' }).click();
  await admin.waitForTimeout(1200);
  check('a card can be assigned and given a due date', true);
  await admin.screenshot({ path: join(SHOTS, 'p5-card-detail-light.png'), fullPage: true });

  // ---- Comments, mentions and activity (Phases 8-9) ----------------------
  // Still on the card detail screen from the assignment above.
  const commentBox = admin.getByPlaceholder('Add a comment — @ to mention someone');
  await commentBox.waitFor({ timeout: 20000 });
  await commentBox.click();
  await commentBox.pressSequentially('Kicking this off, cc @sara', { delay: 10 });
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

  const showsBoardName = await sara
    .getByText('Fundraising 2026')
    .first()
    .isVisible()
    .catch(() => false);
  check('My Work names the board, resolved with no extra reads', showsBoardName);

  const showsToday = await sara.getByText('Today', { exact: false }).first().isVisible();
  check('My Work groups by due state', showsToday);
  await sara.screenshot({ path: join(SHOTS, 'p6-mywork-light.png'), fullPage: true });

  // ---- Notifications inbox (Phase 10) -------------------------------------
  // Sara was @mentioned and assigned, so her inbox should hold entries written
  // by the triggers — not by any client.
  await sara.getByRole('button', { name: 'Boards' }).click();
  await sara.getByRole('button', { name: /^Alerts/ }).click();
  await sara.getByText('Notifications').first().waitFor({ timeout: 20000 });
  await sara.getByText('mentioned you', { exact: false }).waitFor({ timeout: 25000 });
  check('an @mention lands in the recipient inbox', true);

  const assignedEntry = await sara
    .getByText('assigned you', { exact: false })
    .first()
    .isVisible()
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
  await sara.waitForTimeout(1500);
  const stillUnread = await sara
    .getByText('· unread', { exact: false })
    .first()
    .isVisible()
    .catch(() => false);
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
  await admin.getByText('No matches').waitFor({ timeout: 20000 });
  check('archived cards are excluded from search by default', true);

  await admin.getByRole('button', { name: 'Excluding archived' }).click();
  await admin.getByText('Draft newsletter').first().waitFor({ timeout: 20000 });
  check('archived cards are findable when explicitly included', true);
  await admin.screenshot({ path: join(SHOTS, 'p11-search-light.png'), fullPage: true });

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

  // The trigger deletes the account, but the client's ID token stays valid until
  // it refreshes — so the app does not get signed out. It must explain itself
  // rather than spin: after a grace period it shows "Wrong account".
  await bad.getByText('Wrong account').waitFor({ timeout: 40000 });
  check('a non-org account is rejected server-side and told why', true);

  const reachedAGate = await bad
    .getByText('Waiting for approval')
    .isVisible()
    .catch(() => false);
  check('a rejected account never reaches the approval queue', !reachedAGate);
  await bad.screenshot({ path: join(SHOTS, 'p1-wrong-domain-light.png'), fullPage: true });

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
