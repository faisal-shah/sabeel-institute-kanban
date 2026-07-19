import { chromium } from 'playwright';
const b = await chromium.launch();
// Pixel-ish CSS viewport (1080x2400 @ dpr3 ≈ 360x800)
const ctx = await b.newContext({ viewport: { width: 360, height: 800 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 });
const p = await ctx.newPage();
p.on('dialog', d => d.accept());
p.on('pageerror', e => console.error('PAGE ERROR:', String(e).slice(0,200)));
await p.goto('http://127.0.0.1:8086/', { waitUntil: 'networkidle' });
await p.getByRole('button', { name: 'faisal', exact: true }).click();
await p.getByRole('button', { name: 'New board' }).waitFor({ timeout: 40000 });

// A brand-new board with the 3 default columns and NO cards — his case.
await p.getByRole('button', { name: 'New board' }).click();
await p.getByPlaceholder('Board name').fill('Test board 1');
await p.getByRole('button', { name: 'Create', exact: true }).click();
await p.getByText('To Do').first().waitFor({ timeout: 30000 });
await p.waitForTimeout(2500);
await p.screenshot({ path: 'shots/repro-empty-narrow.png' });

const addVisible = await p.getByRole('button', { name: '+ Add card' }).first().isVisible().catch(() => false);
console.log('"+ Add card" visible on empty narrow board:', addVisible);
console.log('--- body text ---');
console.log((await p.locator('body').innerText()).slice(0, 300));
await b.close();
