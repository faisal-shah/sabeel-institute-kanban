/**
 * Authenticated screen tour, for LOOKING at every screen — not just the board
 * layout that device-shots.mjs covers. Signs in as faisal (dev row) and walks
 * Alerts, People, My work, the board, board Settings, and a card, at a desktop
 * and a phone width. Writes to shots/colors/.
 *
 * Assumes emulators + `npm run dev:web` are running and the data is seeded
 * (`npm run seed`). This is the verification the colour-scheme change needed:
 * blind edits were not enough — content text that had drifted to `text.muted`
 * (2.7:1) only showed up by looking at the rendered screens.
 *
 *   node scripts/screen-tour.mjs
 */
import { chromium, devices } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const BASE = process.env.E2E_BASE ?? 'http://127.0.0.1:8086/';
const OUT = resolve(import.meta.dirname, '..', 'shots', 'colors');
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch();

async function run(tag, contextOptions) {
  const ctx = await browser.newContext(contextOptions);
  const page = await ctx.newPage();
  const shot = (n) => page.screenshot({ path: join(OUT, `${tag}-${n}.png`), fullPage: true });
  try {
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'faisal', exact: true }).click();
    await page.getByRole('button', { name: 'New board' }).waitFor({ timeout: 30000 });

    // Alerts / notifications inbox
    await page.getByRole('button', { name: /Alerts/ }).click();
    await page.waitForTimeout(1200); await shot('alerts');
    await page.goBack().catch(() => {});
    await page.waitForTimeout(500);

    // People / admin panel
    await page.getByRole('button', { name: 'People', exact: true }).click();
    await page.waitForTimeout(1200); await shot('people');
    await page.getByRole('button', { name: 'Back' }).first().click().catch(() => {});
    await page.waitForTimeout(500);

    // My work
    await page.getByRole('button', { name: 'My work', exact: true }).click();
    await page.waitForTimeout(1200); await shot('mywork');
    await page.getByRole('button', { name: 'Back' }).first().click().catch(() => {});
    await page.waitForTimeout(500);

    // Into the board
    await page.getByText('Fundraising', { exact: false }).first().click();
    await page.waitForTimeout(1800); await shot('board');

    // Board settings
    const settings = page.getByRole('button', { name: 'Settings' }).first();
    if (await settings.isVisible().catch(() => false)) {
      await settings.click(); await page.waitForTimeout(1200); await shot('settings');
      await page.getByRole('button', { name: /Back|Close|Done/ }).first().click().catch(() => {});
      await page.waitForTimeout(500);
    }

    // Card detail — open the first card
    await page.getByText('Book the venue', { exact: false }).first().click().catch(() => {});
    await page.waitForTimeout(1500); await shot('card');
  } catch (e) {
    console.error(`${tag}: ${e.message}`);
  } finally {
    await ctx.close();
  }
}

await run('desktop', { viewport: { width: 1440, height: 1000 } });
await run('phone', devices['iPhone 14']);
await browser.close();
console.log('done');
