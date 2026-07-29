/**
 * THE visual/layout regression harness. Every screen, every width, looked at
 * AND checked.
 *
 *   bash scripts/e2e.sh scripts/screens-e2e.mjs                # the CI set
 *   SWEEP_FULL=1   bash scripts/e2e.sh scripts/screens-e2e.mjs # + device profiles
 *   SWEEP_WIDTHS=320 bash scripts/e2e.sh scripts/screens-e2e.mjs  # one width
 *
 * It replaced four hand-run screenshot scripts, and the lesson they encode
 * between them is the reason this one asserts: A TOUR THAT CANNOT FAIL IS A
 * SCREENSHOT GENERATOR. The closest of them wrapped its whole body in a
 * try/catch that logged and continued, so it reported success either way — and
 * had rotted to clicking "People" as a top-level button long after that moved
 * into the More sheet. So: this exits non-zero, and `app/src/ciCoverage.test.ts`
 * fails if CI ever stops running it.
 *
 * WHAT IT CHECKS, and the bug each one is here for:
 *   - the page never scrolls sideways         the classic responsive failure a
 *                                             top-of-page shot never reveals
 *   - no two same-layer controls overlap      the search chips crowding the
 *                                             board dropdown — at one width and
 *                                             not another
 *   - every screen has a way out              Stats shipped with no Back and no
 *                                             tab bar: a dead end on a phone
 *                                             browser, where there is no
 *                                             hardware Back either
 *   - the right board layout rendered         columns vs swipe, vs the
 *                                             breakpoint read from source
 *   - targets under 44px are REPORTED         not failed — informational
 *
 * Deliberately NOT checked: a generic "is any text truncated". It fires on every
 * intentional `numberOfLines` clamp in the app and would drown the real signal.
 * Scope that check to the surface that needs it, as stats-e2e does for its axis.
 *
 * Seeding goes through the Admin SDK: deterministic, seconds not minutes, and
 * clients cannot write most of it anyway.
 */
import { chromium, devices } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const BASE = process.env.E2E_BASE ?? 'http://127.0.0.1:8086/';
const ROOT = resolve(import.meta.dirname, '..');
const SHOTS = resolve(ROOT, 'shots', 'screens');
const PROJECT = 'demo-sabeel-kanban';
const FULL = process.env.SWEEP_FULL === '1';

process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= '127.0.0.1:9099';
process.env.GCLOUD_PROJECT = PROJECT;

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok });
  // Detail describes the FAILURE, so it is printed only when there is one.
  // Appending it to a passing line produced `ok ... — no Back and no tab bar`,
  // which reads as the opposite of what happened.
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${!ok && detail ? ` — ${detail}` : ''}`);
}

const grantAdmin = (email) =>
  new Promise((res, rej) => {
    const c = spawn('node', [resolve(ROOT, 'scripts/grant-admin.mjs'), email], {
      env: { ...process.env },
      stdio: 'pipe',
    });
    c.on('exit', (code) => (code === 0 ? res() : rej(new Error(`grant-admin exited ${code}`))));
  });

/**
 * The breakpoint comes from the SOURCE, never from a copy here.
 * A constant restated in a test drifts from the thing it is testing — that has
 * already happened once in this repo.
 */
const layoutSrc = await readFile(resolve(ROOT, 'app/src/theme/layout.ts'), 'utf8');
const WIDE_BREAKPOINT = Number(layoutSrc.match(/WIDE_BREAKPOINT\s*=\s*(\d+)/)?.[1] ?? 768);

/**
 * Widths chosen to straddle the breakpoint rather than to look thorough: a bug
 * on one side of it is invisible from the other, which is how `Screen`'s
 * phone-only spacing gap survived. One below, one at, one above, one wide.
 */
const WIDTHS = process.env.SWEEP_WIDTHS
  ? process.env.SWEEP_WIDTHS.split(',').map(Number)
  : [320, 390, WIDE_BREAKPOINT, 1024, 1440];
/** Real descriptors add DPR, touch and UA, which plain widths do not. */
const PROFILES = FULL
  ? [['iphone-se', devices['iPhone SE']], ['pixel-7', devices['Pixel 7']], ['ipad-mini', devices['iPad Mini']]]
  : [];

await mkdir(SHOTS, { recursive: true });
initializeApp({ projectId: PROJECT });
const db = getFirestore();
const browser = await chromium.launch();

// ---- Provision, then seed against the real uid -----------------------------
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.getByText('Dev sign-in (emulator only)').waitFor({ timeout: 20000 });
  await page.getByRole('button', { name: 'faisal', exact: true }).click();
  await page.getByText('Waiting for approval').waitFor({ timeout: 25000 });
  await grantAdmin('faisal@oursabeel.com');
  await page.getByRole('button', { name: 'New board' }).waitFor({ timeout: 25000 });
  await ctx.close();
}

const users = await db.collection('users').where('email', '==', 'faisal@oursabeel.com').get();
if (users.empty) throw new Error('the dev account was never provisioned');
const uid = users.docs[0].id;

const now = Date.now();
const BOARD = 'sw_board';
await db.doc('labels/sw_l1').set({ name: 'Finance', color: '#83114F', createdAt: now, createdBy: uid });
await db.doc('labels/sw_l2').set({ name: 'Outreach', color: '#A8B89A', createdAt: now, createdBy: uid });
await db.doc(`boards/${BOARD}`).set({
  name: 'Fundraising 2026',
  description: 'A board with enough on it to lay out properly.',
  archived: false,
  columns: [
    { id: 'c1', name: 'To Do' },
    { id: 'c2', name: 'In Progress' },
    { id: 'c3', name: 'Done' },
  ],
  columnIds: ['c1', 'c2', 'c3'],
  memberUids: [uid],
  memberProfiles: { [uid]: { displayName: 'Faisal', email: 'faisal@oursabeel.com' } },
  activeCardCount: 0,
  createdAt: now,
  createdBy: uid,
});

// Content chosen to STRESS layout: a long title, every priority, labels and an
// assignee on each, so card faces are at their widest.
const CARDS = [
  ['sw_card1', 'c1', 'Book the venue for the spring fundraiser', 'urgent'],
  ['sw_card2', 'c1', 'Draft the donor letter', 'high'],
  ['sw_card3', 'c2', 'Reconcile the Q2 accounts', 'medium'],
  ['sw_card4', 'c3', 'Thank the volunteers', 'none'],
  ['sw_card5', 'c1', 'A deliberately long card title that has to wrap somewhere sensible', 'low'],
];
for (const [id, columnId, title, priority] of CARDS) {
  await db.doc(`cards/${id}`).set({
    boardId: BOARD, title, columnId, priority,
    description: 'Enough description text to give the card body something to lay out.',
    rank: `V${id.slice(-1)}`,
    assigneeUids: [uid], subscriberUids: [uid], labelIds: ['sw_l1', 'sw_l2'],
    dueDate: '2026-08-15', archived: false, commentCount: 1,
    createdAt: now, createdBy: uid, updatedAt: now, updatedBy: uid,
  });
  await db.doc(`cards/${id}/comments/cm1`).set({
    authorUid: uid, body: 'A comment, so the thread is not empty when measured.',
    mentionUids: [], createdAt: now,
  });
}
await db.doc('cards/sw_archived').set({
  boardId: BOARD, title: 'An archived card', description: '', columnId: 'c1', rank: 'Vz',
  assigneeUids: [], labelIds: [], priority: 'none', archived: true, archivedAt: now,
  commentCount: 0, createdAt: now, createdBy: uid, updatedAt: now, updatedBy: uid,
});
await db.doc(`users/${uid}/notifications/n1`).set({
  type: 'assigned', boardId: BOARD, cardId: 'sw_card1', actorUid: uid,
  text: 'Faisal assigned you "Book the venue for the spring fundraiser"',
  read: false, at: now,
});
await db.doc(`users/${uid}`).update({ unreadNotifCount: 1 });
console.log(`  seeded 1 board, ${CARDS.length} cards, 2 labels, 1 archived card, 1 alert`);
console.log(`  breakpoint read from source: ${WIDE_BREAKPOINT}px\n`);

// ---- Assertions ------------------------------------------------------------
const layoutFaults = (page, width) =>
  page.evaluate((w) => {
    const faults = [];
    // Inner horizontal scrollers (the board, the chart) are their own elements,
    // so the PAGE should never widen. This is the classic responsive failure a
    // top-of-page screenshot never reveals.
    const bleed = document.documentElement.scrollWidth - w;
    if (bleed > 1) faults.push(`page scrolls sideways by ${bleed}px`);

    /**
     * The part of an element you can actually SEE.
     *
     * `getBoundingClientRect` reports where an element would be, not what is
     * visible: a card scrolled halfway out of its list still returns its full
     * height, so it geometrically "overlaps" whatever sits below the list — the
     * bottom nav, in the first version of this check, on every screen with more
     * content than fits. Clipping an ancestor does not shrink the rect, so the
     * rect has to be clipped here instead.
     */
    const visibleRect = (el) => {
      let r = el.getBoundingClientRect();
      for (let n = el.parentElement; n && n !== document.documentElement; n = n.parentElement) {
        const o = getComputedStyle(n).overflow + getComputedStyle(n).overflowY;
        if (!/hidden|auto|scroll/.test(o)) continue;
        const c = n.getBoundingClientRect();
        r = {
          left: Math.max(r.left, c.left),
          right: Math.min(r.right, c.right),
          top: Math.max(r.top, c.top),
          bottom: Math.min(r.bottom, c.bottom),
        };
      }
      // And by the viewport itself.
      return {
        left: Math.max(r.left, 0),
        right: Math.min(r.right, window.innerWidth),
        top: Math.max(r.top, 0),
        bottom: Math.min(r.bottom, window.innerHeight),
      };
    };
    const area = (r) => Math.max(0, r.right - r.left) * Math.max(0, r.bottom - r.top);

    /** The nearest positioned ancestor — a fixed nav, a modal, or the page. */
    const layerOf = (el) => {
      for (let n = el; n && n !== document.body; n = n.parentElement) {
        const pos = getComputedStyle(n).position;
        if (pos === 'fixed' || pos === 'sticky' || pos === 'absolute') return n;
      }
      return document.body;
    };

    // Only things actually on screen: an element scrolled out of view cannot
    // overlap anything a person can see.
    const els = [...document.querySelectorAll('[role="button"], [role="radio"]')].filter(
      (e) => area(visibleRect(e)) > 4,
    );
    const name = (e) => (e.getAttribute('aria-label') || e.textContent || '?').trim().slice(0, 22);
    for (let i = 0; i < els.length; i++) {
      for (let j = i + 1; j < els.length; j++) {
        const a = els[i], b = els[j];
        // Nesting is legitimate (a control inside a pressable row); two
        // INDEPENDENT controls sharing pixels is not.
        if (a.contains(b) || b.contains(a)) continue;
        // Neither is overlap ACROSS LAYERS. The bottom nav is fixed and content
        // scrolls beneath it by design; so does a sheet over a screen. Only
        // controls in the SAME layer are laid out against each other, so that is
        // the only pair worth comparing — the first version of this check
        // reported every search result "overlapping" the nav bar at 320px.
        if (layerOf(a) !== layerOf(b)) continue;
        const ra = visibleRect(a), rb = visibleRect(b);
        const ox = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
        const oy = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
        if (ox > 1 && oy > 1) {
          faults.push(`"${name(a)}" overlaps "${name(b)}" by ${Math.round(ox)}x${Math.round(oy)}px`);
        }
      }
    }
    return [...new Set(faults)];
  }, width);

/**
 * Can you LEAVE this screen without the browser's Back?
 *
 * The bottom bar renders on tab roots only (`isTabRoot`), so a pushed screen on a
 * phone has exactly one exit: its own Back control. `StatsScreen` shipped without
 * one and was a dead end on a phone browser, where there is no hardware Back
 * either — found because the tour got stuck there, which is luck, not a test.
 * Every screen, every width: a Back, or a tab bar. One of the two.
 */
const escapes = (page) =>
  page.evaluate(() => {
    const shown = (e) => {
      const r = e.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    const label = (e) => (e.getAttribute('aria-label') || e.textContent || '').trim();
    const controls = [...document.querySelectorAll('[role="button"]')].filter(shown);
    return {
      back: controls.some((e) => /^back$/i.test(label(e))),
      tabs: controls.some((e) => /^(Boards|My Work)$/.test(label(e))),
    };
  });

const smallTargets = (page) =>
  page.evaluate(() => [
    ...new Set(
      [...document.querySelectorAll('[role="button"], [role="radio"]')]
        .map((e) => ({
          n: (e.getAttribute('aria-label') || e.textContent || '?').trim().slice(0, 18),
          r: e.getBoundingClientRect(),
        }))
        .filter((x) => x.r.width > 0 && x.r.height > 0 && x.r.height < 44)
        .map((x) => `${x.n} ${Math.round(x.r.height)}px`),
    ),
  ]);

// ---- The tour --------------------------------------------------------------
const SCREENS = 10;

async function tour(page, tag, width) {
  /**
   * Get back to a tab root, THEN tap the tab.
   *
   * On a narrow layout the bottom bar renders on tab roots only (see
   * `isTabRoot`), so a pushed screen — People, a card, Settings — has no nav to
   * tap and the tour has to walk Back first. The wide rail is always present, so
   * this is a no-op there. Written once here rather than remembered at ten call
   * sites, which is how the old tour drifted.
   */
  const nav = async (label) => {
    for (let i = 0; i < 6; i += 1) {
      const tab = page.getByRole('button', { name: label, exact: true }).first();
      if (await tab.isVisible().catch(() => false)) {
        await tab.click();
        await page.waitForTimeout(700);
        return;
      }
      const back = page.getByRole('button', { name: 'Back' }).first();
      if (!(await back.isVisible().catch(() => false))) break;
      await back.click();
      await page.waitForTimeout(600);
    }
    throw new Error(`could not reach the "${label}" tab`);
  };
  let seen = 0;

  const visit = async (name, go) => {
    await go();
    await page.waitForTimeout(500);
    const faults = await layoutFaults(page, width);
    check(`${tag} / ${name}`, faults.length === 0, faults.join('; ').slice(0, 160));
    const out = await escapes(page);
    check(`${tag} / ${name} has a way out`, out.back || out.tabs, 'no Back and no tab bar');
    const small = await smallTargets(page);
    if (small.length) console.log(`         under 44px: ${small.join(', ').slice(0, 100)}`);
    await page.screenshot({ path: join(SHOTS, `${tag}-${name}.png`), fullPage: true });
    seen += 1;
  };

  await visit('boards', () => nav('Boards'));
  await visit('mywork', () => nav('My Work'));
  await visit('search', () => nav('Search'));
  /**
   * The search box takes the cursor on a DESKTOP and nowhere else.
   *
   * A phone browser is `Platform.OS === 'web'` too, so keying autofocus off the
   * platform opened the on-screen keyboard over the results on exactly the
   * surface the setting was added to protect. Width is the real question, so it
   * is checked at every width rather than asserted once.
   */
  {
    const focused = await page.evaluate(
      () => document.activeElement?.getAttribute('placeholder') ?? 'none',
    );
    const wantsCursor = width >= WIDE_BREAKPOINT;
    const hasCursor = focused.startsWith('Search cards');
    check(
      `${tag} / search ${wantsCursor ? 'takes' : 'does not take'} the cursor`,
      hasCursor === wantsCursor,
      `activeElement placeholder = ${focused}`,
    );
  }
  await visit('alerts', () => nav('Alerts'));
  await visit('stats', async () => {
    await page.getByRole('button', { name: 'More' }).click();
    await page.getByRole('button', { name: 'Stats' }).click();
  });
  await visit('people', async () => {
    await nav('Boards');
    await page.getByRole('button', { name: 'More' }).click();
    await page.getByRole('button', { name: 'People' }).click();
  });

  await visit('board', async () => {
    await nav('Boards');
    await page.getByText('Fundraising 2026').first().click();
    await page.waitForTimeout(1000);
  });

  // Which board layout actually rendered? The pager exists only in the narrow
  // one, and the expectation comes from the source breakpoint rather than a
  // number copied into this file.
  const expected = width >= WIDE_BREAKPOINT ? 'columns' : 'swipe';
  const hasPager = await page.getByText('Prev', { exact: false }).first().isVisible().catch(() => false);
  const actual = hasPager ? 'swipe' : 'columns';
  check(`${tag} / board renders the ${expected} layout`, actual === expected, `got ${actual}`);

  await visit('card', async () => {
    await page.locator('[data-testid^="card-"]').first().click();
    await page.getByRole('button', { name: 'Share card' }).waitFor({ timeout: 20000 });
  });
  await visit('settings', async () => {
    await page.getByRole('button', { name: 'Back' }).first().click();
    await page.waitForTimeout(800);
    await page.getByRole('button', { name: 'Board settings' }).click();
  });
  await visit('archive', async () => {
    await page.getByRole('button', { name: 'Back' }).first().click();
    await page.waitForTimeout(800);
    await page.getByRole('button', { name: 'Archived cards' }).click();
  });


  check(`${tag} reached every screen`, seen === SCREENS, `${seen}/${SCREENS}`);
}

try {
  const runs = [
    ...WIDTHS.map((w) => [`${w}px`, { viewport: { width: w, height: 900 } }, w]),
    ...PROFILES.map(([label, d]) => [label, d, d.viewport.width]),
  ];
  for (const [tag, contextOptions, width] of runs) {
    const ctx = await browser.newContext(contextOptions);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => check(`${tag} page error`, false, String(e).slice(0, 90)));
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'faisal', exact: true }).click();
    await page.getByRole('button', { name: 'More' }).waitFor({ timeout: 30000 });
    await tour(page, tag, width);
    await ctx.close();
  }
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
console.log(`shots/screens/ — ${WIDTHS.length + PROFILES.length} viewports x ${SCREENS} screens`);
if (!FULL) console.log('SWEEP_FULL=1 adds real device profiles (DPR, touch, UA).');
if (failed.length) {
  console.error(`FAILED: ${failed.map((f) => f.name).join('; ')}`);
  process.exit(1);
}
