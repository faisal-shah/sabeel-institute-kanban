/**
 * Screenshot the app on REAL device profiles.
 *
 * Playwright ships maintained descriptors (viewport, device pixel ratio, touch,
 * user agent) for actual handsets and tablets, so there is no reason to guess at
 * widths. Tablets are captured in both orientations, because portrait and
 * landscape land on opposite sides of the layout breakpoint for some of them —
 * which is exactly where a width-driven layout earns its keep or fails.
 *
 * Assumes emulators + `npm run dev:web` are running and faisal is an admin.
 *
 *   node scripts/device-shots.mjs
 */
import { chromium, devices } from 'playwright';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

// Read the breakpoint out of the source rather than restating it here, so this
// check can never quietly disagree with the app it is checking.
const layoutSrc = await readFile(
  resolve(import.meta.dirname, '..', 'app', 'src', 'theme', 'layout.ts'),
  'utf8',
);
const WIDE_BREAKPOINT = Number(
  layoutSrc.match(/WIDE_BREAKPOINT\s*=\s*(\d+)/)?.[1] ?? 768,
);

const BASE = process.env.E2E_BASE ?? 'http://127.0.0.1:8086/';
const OUT = resolve(import.meta.dirname, '..', 'shots', 'devices');

/**
 * Named Playwright descriptors, plus desktop sizes it does not ship.
 * `rotate` captures the landscape variant too.
 */
const PROFILES = [
  { label: 'iphone-se', device: devices['iPhone SE'] },
  { label: 'iphone-14', device: devices['iPhone 14'] },
  { label: 'iphone-14-pro-max', device: devices['iPhone 14 Pro Max'] },
  { label: 'galaxy-s9', device: devices['Galaxy S9+'] },
  { label: 'galaxy-s24', device: devices['Galaxy S24'] ?? devices['Galaxy S9+'] },
  { label: 'ipad-mini', device: devices['iPad Mini'], rotate: true },
  { label: 'ipad-pro-11', device: devices['iPad Pro 11'], rotate: true },
  { label: 'galaxy-tab-s4', device: devices['Galaxy Tab S4'], rotate: true },
  // Desktop sizes Playwright has no descriptor for.
  { label: 'laptop-1366', viewport: { width: 1366, height: 768 } },
  { label: 'desktop-1920', viewport: { width: 1920, height: 1080 } },
  { label: 'desktop-2560', viewport: { width: 2560, height: 1440 } },
];

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const report = [];

async function capture(label, contextOptions) {
  const ctx = await browser.newContext(contextOptions);
  const page = await ctx.newPage();
  const width = page.viewportSize()?.width ?? 0;
  const expected = width >= WIDE_BREAKPOINT ? 'columns' : 'swipe';

  try {
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.getByText('Sign in with Google').waitFor({ timeout: 30000 });
    await page.screenshot({ path: join(OUT, `${label}-signin.png`) });

    await page.getByRole('button', { name: 'faisal', exact: true }).click();
    await page.getByRole('button', { name: 'New board' }).waitFor({ timeout: 30000 });
    await page.screenshot({ path: join(OUT, `${label}-boards.png`) });

    const board = page.getByText('Fundraising', { exact: false }).first();
    let actual = 'n/a';
    if (await board.isVisible().catch(() => false)) {
      await board.click();
      await page.waitForTimeout(2500);
      await page.screenshot({ path: join(OUT, `${label}-board.png`) });
      // Which layout actually rendered? The pager only exists in the narrow one.
      const hasPager = await page
        .getByText('Prev', { exact: false })
        .first()
        .isVisible()
        .catch(() => false);
      actual = hasPager ? 'swipe' : 'columns';
    }

    // Horizontal overflow is the classic responsive failure: content wider than
    // the viewport, which no screenshot of the top of the page would reveal.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );

    const ok = (actual === 'n/a' || actual === expected) && overflow <= 1;
    report.push({ label, width, expected, actual, overflowPx: overflow, ok });
    console.log(
      `${ok ? ' ok ' : 'FAIL'}  ${label.padEnd(20)} ${String(width).padStart(5)}px  ` +
        `expected=${expected} actual=${actual} overflow=${overflow}px`,
    );
  } finally {
    await ctx.close();
  }
}

try {
  for (const p of PROFILES) {
    if (p.device) {
      await capture(p.label, p.device);
      if (p.rotate) {
        const { width, height } = p.device.viewport;
        await capture(`${p.label}-landscape`, {
          ...p.device,
          viewport: { width: height, height: width },
        });
      }
    } else {
      await capture(p.label, { viewport: p.viewport });
    }
  }
} finally {
  await browser.close();
}

await writeFile(join(OUT, 'report.json'), JSON.stringify(report, null, 2));

const failed = report.filter((r) => !r.ok);
console.log(`\n${report.length - failed.length}/${report.length} device profiles OK`);
if (failed.length) {
  console.error('FAILED:', failed.map((f) => `${f.label} (${f.width}px)`).join(', '));
  process.exit(1);
}
