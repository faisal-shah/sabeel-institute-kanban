/**
 * Screenshot the app at several widths, so responsive behaviour is verified by
 * looking rather than asserted.
 *
 * Assumes the emulators and `npm run dev:web` are already running, and that
 * faisal@oursabeel.com has been granted admin.
 *
 *   node scripts/responsive-shots.mjs
 */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const BASE = process.env.E2E_BASE ?? 'http://127.0.0.1:8086/';
const OUT = resolve(import.meta.dirname, '..', 'shots', 'responsive');

const SIZES = [
  { name: 'desktop-1440', width: 1440, height: 900 },
  { name: 'laptop-1024', width: 1024, height: 768 },
  { name: 'tablet-820', width: 820, height: 1180 },
  { name: 'phone-390', width: 390, height: 844 },
];

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();

try {
  for (const size of SIZES) {
    const ctx = await browser.newContext({
      viewport: { width: size.width, height: size.height },
    });
    const page = await ctx.newPage();
    await page.goto(BASE, { waitUntil: 'networkidle' });

    await page.getByText('Sign in with Google').waitFor({ timeout: 30000 });
    await page.screenshot({ path: join(OUT, `${size.name}-signin.png`) });

    await page.getByRole('button', { name: 'faisal', exact: true }).click();
    await page.getByRole('button', { name: 'New board' }).waitFor({ timeout: 30000 });
    await page.screenshot({ path: join(OUT, `${size.name}-boards.png`) });

    // Open the first board if one exists, to compare board layouts by width.
    const firstBoard = page.getByText('Fundraising', { exact: false }).first();
    if (await firstBoard.isVisible().catch(() => false)) {
      await firstBoard.click();
      await page.waitForTimeout(2500);
      await page.screenshot({ path: join(OUT, `${size.name}-board.png`) });
    }

    console.log(`captured ${size.name} (${size.width}px)`);
    await ctx.close();
  }
} finally {
  await browser.close();
}
