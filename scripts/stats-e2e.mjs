/**
 * The Stats chart, against a realistically DENSE dataset.
 *
 *   bash scripts/e2e.sh scripts/stats-e2e.mjs
 *
 * A focused suite, and one that seeds rather than earns its data. The full
 * `web-e2e.mjs` run produces a handful of cards on a single day, which draws one
 * bar and proves nothing about the case that actually breaks a chart: sixty
 * columns competing for a phone's width. So this writes a year of plausible
 * counters straight into `stats/**` with the Admin SDK — the same shape the
 * triggers produce — and then LOOKS at every view.
 *
 * Seeding server-side is not a shortcut around the rules: clients cannot write
 * these documents at all, by design, so the Admin SDK is the only way to stand
 * up a fixture.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const BASE = process.env.E2E_BASE ?? 'http://127.0.0.1:8086/';
const SHOTS = resolve(import.meta.dirname, '..', 'shots');
const PROJECT = 'demo-sabeel-kanban';

process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= '127.0.0.1:9099';
process.env.GCLOUD_PROJECT = PROJECT;

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}

function grantAdmin(email) {
  return new Promise((res, rej) => {
    const child = spawn('node', [resolve(import.meta.dirname, 'grant-admin.mjs'), email], {
      env: { ...process.env },
      stdio: 'pipe',
    });
    child.on('exit', (c) => (c === 0 ? res() : rej(new Error(`grant-admin exited ${c}`))));
  });
}

// ---- Seed ------------------------------------------------------------------
initializeApp({ projectId: PROJECT });
const db = getFirestore();

const addDays = (day, n) => {
  const [y, m, d] = day.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
};

// Today per the app's own rule, so "in progress" lines up with what it renders.
const today = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Chicago',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(new Date());

const PEOPLE = ['ann', 'bo', 'cy', 'di', 'ed'];
const months = new Map();
let seededCards = 0;

// A year back, with weekends quiet and one deliberate import-sized spike, so the
// chart is exercised on the shape real data actually has rather than on noise.
for (let i = 364; i >= 0; i--) {
  const day = addDays(today, -i);
  const dow = new Date(`${day}T00:00:00Z`).getUTCDay();
  const weekend = dow === 0 || dow === 6;
  // Deterministic pseudo-random, so a failure is reproducible.
  const r = (Math.sin(i * 12.9898) * 43758.5453) % 1;
  const busy = Math.abs(r);
  if (weekend && busy < 0.7) continue;

  const created = i === 120 ? 45 : Math.round(busy * (weekend ? 2 : 9));
  if (created === 0 && busy < 0.4) continue;

  const key = day.slice(0, 7);
  const dd = day.slice(8, 10);
  if (!months.has(key)) months.set(key, {});
  months.get(key)[dd] = {
    cardsCreated: created,
    cardsArchived: Math.round(busy * 4),
    comments: Math.round(busy * 12),
    filesAdded: busy > 0.8 ? 1 : 0,
    filesRemoved: busy > 0.95 ? 1 : 0,
    actors: PEOPLE.slice(0, 1 + Math.floor(busy * 4)),
  };
  seededCards += created;
}

for (const [month, days] of months) {
  await db.doc(`stats/_all/months/${month}`).set({ scope: '_all', month, days });
}
await db.doc('stats/_all').set({ bytesStored: 3111887, filesStored: 4 }, { merge: true });
console.log(`  seeded ${months.size} month documents, ${seededCards} cards created`);

// ---- Drive -----------------------------------------------------------------
await mkdir(SHOTS, { recursive: true });
const browser = await chromium.launch();
let page;

/** Every axis label currently drawn, in order, with its x position and width. */
const labelBoxes = async (p) => {
  const texts = await p.locator('[data-testid="stats-axis"]').all();
  const out = [];
  for (const el of texts) {
    const box = await el.boundingBox();
    const text = (await el.textContent())?.trim() ?? '';
    if (box && text) out.push({ text, ...box });
  }
  return out;
};

/**
 * The widths to prove this at.
 *
 * A chart that is only ever looked at on the developer's monitor is a chart
 * that breaks on a phone. These span the real range: a small Android, ordinary
 * phones, a phone in landscape, tablets, and a wide desktop — including the
 * narrowest width the app supports, where there is least room for a label and
 * most temptation for one to collide.
 */
const WIDTHS = [320, 360, 390, 430, 600, 768, 1024, 1280, 1600];
/** Only a few are captured; the rest are checked, not photographed. */
const CAPTURE = new Set([320, 768, 1600]);

try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 950 } });
  page = await ctx.newPage();
  page.on('pageerror', (e) => console.error('   page error:', String(e)));
  await page.goto(BASE, { waitUntil: 'networkidle' });

  await page.getByText('Dev sign-in (emulator only)').waitFor({ timeout: 20000 });
  await page.getByRole('button', { name: 'faisal', exact: true }).click();
  await page.getByText('Waiting for approval').waitFor({ timeout: 25000 });
  await grantAdmin('faisal@oursabeel.com');
  await page.getByRole('button', { name: 'More' }).waitFor({ timeout: 30000 });

  await page.getByRole('button', { name: 'More' }).click();
  await page.getByRole('button', { name: 'Stats' }).click();
  await page.getByText('Stats', { exact: true }).first().waitFor({ timeout: 20000 });
  await page.waitForTimeout(900);

  for (const width of WIDTHS) {
    // Resizing an already-open chart also exercises the relayout path, which is
    // what a phone rotating actually does — a fresh load at each size would
    // quietly skip it.
    await page.setViewportSize({ width, height: 950 });
    await page.waitForTimeout(450);

    for (const view of ['Daily', 'Weekly', 'Monthly']) {
      await page.getByRole('radio', { name: view, exact: true }).click();
      await page.waitForTimeout(400);

      const boxes = await labelBoxes(page);
      const tag = `${width}px/${view}`;

      // NO OVERLAPPING TEXT. The one property a chart cannot be allowed to
      // fail, and the one that is invisible to every other kind of test.
      let overlaps = 0;
      const sorted = [...boxes].sort((a, b) => a.x - b.x);
      for (let i = 1; i < sorted.length; i++) {
        if (sorted[i].x < sorted[i - 1].x + sorted[i - 1].width - 0.5) overlaps++;
      }
      check(`${tag}: labels never overlap`, overlaps === 0, `${boxes.length} labels`);

      // And they must not be ellipsised.
      //
      // Checked by MEASURING, not by looking for "…" in the text: CSS renders
      // the ellipsis in pixels and leaves textContent whole, so the obvious
      // version of this check passed while the phone rendered "2…" for
      // "21 Jul". A test that cannot see the bug it is for is worse than none.
      const measured = await page.evaluate(() =>
        [...document.querySelectorAll('[data-testid="stats-axis"]')]
          .filter((el) => el.textContent?.trim())
          .map((el) => ({ text: el.textContent, need: el.scrollWidth, have: el.clientWidth })),
      );
      const clipped = measured.filter((m) => m.need > m.have + 1);
      check(`${tag}: labels are not truncated`, clipped.length === 0,
        clipped.map((c) => `${c.text} needs ${c.need}`).join(', ').slice(0, 50));

      // NOT SLICED BY THE SCROLL EDGE. The overlap check passes happily while
      // the first label is cut in half by the scroller, because the element's
      // box is intact and only the pixels are gone — which turned "13 Jul" into
      // "3 Jul": a WRONG date, not a missing one.
      const plotBox = await page.locator('[data-testid="stats-plot"]').first().boundingBox();
      const sliced = boxes.filter(
        (b) =>
          b.x + b.width > plotBox.x &&
          b.x < plotBox.x + plotBox.width &&
          (b.x < plotBox.x - 0.5 || b.x + b.width > plotBox.x + plotBox.width + 0.5),
      );
      check(`${tag}: no label sliced by the scroll edge`,
        boxes.length > 0 && sliced.length === 0,
        sliced.map((c) => c.text).join(','));

      // Bars stay wide enough to hit, and the panel never scrolls sideways.
      // Counted, not just filtered: `filter(...).length === 0` is also true when
      // there are NO bars at all, so the check would pass on a blank chart —
      // the vacuous-assertion trap that let an empty bar satisfy an earlier
      // version of this suite.
      const bars = await page.evaluate(() =>
        [...document.querySelectorAll('[data-testid="stats-bar"]')].map(
          (el) => el.getBoundingClientRect().width,
        ),
      );
      check(
        `${tag}: bars stay tappable`,
        bars.length > 0 && bars.every((w) => w >= 18),
        `${bars.length} bars, narrowest ${bars.length ? Math.min(...bars).toFixed(0) : 'n/a'}px`,
      );

      const bleeds = await page.evaluate(
        (w) => document.documentElement.scrollWidth > w + 1,
        width,
      );
      check(`${tag}: page never scrolls horizontally`, !bleeds);

      // At least one label, whatever the width — an axis with none is unreadable.
      check(`${tag}: the axis is labelled at all`, boxes.length > 0);

      // The month has to appear somewhere, or the numbers are unanchored.
      check(
        `${tag}: a month is named on the axis`,
        boxes.some((b) => /[A-Za-z]/.test(b.text)),
        boxes.map((b) => b.text).join(' ').slice(0, 46),
      );

      // CONTROL SPACING. The period chips and the metric chips answer two
      // different questions, and they have to look like it. They did not: every
      // child of `Screen` gets the same 8px gap, and the wrapped metric chips
      // sat 4px apart inside their own group — so all six read as one set, with
      // a filled chip in each looking like two selections in one control.
      //
      // Measured rather than eyeballed, and measured as a RATIO: absolute gaps
      // drift with the type scale, but "between groups is at least twice within
      // a group" is the property that actually makes them read as separate.
      const spacing = await page.evaluate(() => {
        const chips = [...document.querySelectorAll('[role="button"]')].filter((el) =>
          /(filter, (on|off))$/.test(el.getAttribute('aria-label') ?? ''),
        );
        const period = [...document.querySelectorAll('[role="radio"]')];
        if (chips.length < 6 || period.length !== 3) return null;
        const box = (el) => el.getBoundingClientRect();
        const metrics = chips.map(box);
        const periodBottom = Math.max(...period.map((el) => box(el).bottom));
        const metricTop = Math.min(...metrics.map((b) => b.top));
        // The largest vertical gap between wrapped rows WITHIN the metric group.
        const tops = [...new Set(metrics.map((b) => Math.round(b.top)))].sort((a, b) => a - b);
        const withinGroup =
          tops.length > 1
            ? tops[1] - Math.max(...metrics.filter((b) => Math.round(b.top) === tops[0]).map((b) => b.bottom))
            : null;
        // And the dropdown above must not crowd the first chip either.
        const picker = document.querySelector('[aria-label^="Board filter"]');
        return {
          betweenGroups: metricTop - periodBottom,
          withinGroup,
          belowPicker: Math.min(...period.map((el) => box(el).top)) - box(picker).bottom,
        };
      });
      check(`${tag}: chip groups are visibly separate`,
        spacing !== null && spacing.betweenGroups >= 12 &&
          (spacing.withinGroup === null || spacing.betweenGroups >= spacing.withinGroup * 1.8),
        spacing && `between ${Math.round(spacing.betweenGroups)}px, within ${
          spacing.withinGroup === null ? 'n/a' : Math.round(spacing.withinGroup)}px`);
      // The period control must not be another row of pills.
      const distinct = await page.evaluate(() => {
        const radios = [...document.querySelectorAll('[role="radio"]')];
        const group = document.querySelector('[role="radiogroup"]');
        if (!group || radios.length !== 3) return false;
        const g = group.getBoundingClientRect();
        // Segments sit flush inside ONE bordered object: no gaps between them.
        const xs = radios.map((r) => r.getBoundingClientRect()).sort((a, b) => a.x - b.x);
        const flush = xs.every((b, i) => i === 0 || b.x - xs[i - 1].right < 1.5);
        return flush && g.width < 220;
      });
      check(`${tag}: period is one segmented object, not chips`, distinct);

      check(`${tag}: chips clear the board dropdown`,
        spacing !== null && spacing.belowPicker >= 12,
        spacing && `${Math.round(spacing.belowPicker)}px`);

      if (CAPTURE.has(width)) {
        await page.screenshot({
          path: join(SHOTS, `stats-${width}-${view.toLowerCase()}.png`),
          fullPage: true,
        });
      }
    }
  }

  // Interaction: tap a bar, get its figure.
  const bar = page.getByLabel(/^[1-9]\d* cards created, /).first();
  await bar.click();
  await page.waitForTimeout(300);
  check(
    'tapping a bar reads it out',
    await page.getByText(/^\d+ cards created · /).first().isVisible().catch(() => false),
  );

  await ctx.close();
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  console.error(`FAILED: ${failed.map((f) => f.name).join('; ')}`);
  process.exit(1);
}
