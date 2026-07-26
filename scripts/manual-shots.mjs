// Regenerate the manual's screenshots from the seeded dev stack.
//
//   scripts/dev.sh web      # emulators + web + seed, and WAIT for the seed
//   node scripts/manual-shots.mjs
//
// Covers the six images that change most often — Alerts, a card, and board
// settings, each at both widths. The rest of docs/manual/img/ is still captured
// by hand; add cases here rather than reaching for a browser, because an image
// with no generator is an image that quietly goes stale (these three were a
// release behind before this file existed).
//
// The sizes are not arbitrary: 960x900 and 390x844 are what the manual's `wide`
// and `narrow` figures are laid out for. Keep them.
//
// NOTE: it drives the real UI, so every click must be aimed precisely. On the
// WIDE board each card row carries its own Archive button right beside the
// title, and a stray `Back`/`.first()` click there silently archives the card
// the next run then cannot find. Click by exact text, never by proximity.
import { chromium } from 'playwright';
const OUT = 'docs/manual/img';
const b = await chromium.launch();

async function open(w, h) {
  const p = await b.newPage({ viewport: { width: w, height: h } });
  // Confirmations are accepted, and LOGGED — a dialog firing here means a
  // click landed somewhere it should not have.
  p.on('dialog', (d) => { console.log('DIALOG FIRED:', d.message().slice(0, 70)); d.accept(); });
  p.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
  await p.goto('http://127.0.0.1:8086', { waitUntil: 'networkidle' });
  await p.getByRole('button', { name: 'faisal', exact: true }).click();
  await p.getByRole('button', { name: 'New board' }).waitFor({ timeout: 90000 });
  return p;
}
const board = async (p) => {
  await p.getByText('Fundraising 2026').first().click();
  await p.getByText('Draft the donor letter').first().waitFor({ timeout: 60000 });
  await p.waitForTimeout(1500);
};

for (const [w, h, tag] of [[960, 900, 'wide'], [390, 844, 'phone']]) {
  let p = await open(w, h);
  await p.getByRole('button', { name: /^Alerts/ }).first().click();
  await p.waitForTimeout(2500);
  await p.screenshot({ path: `${OUT}/alerts-${tag}.png` });
  await p.close();

  p = await open(w, h);
  await board(p);
  await p.getByText('Draft the donor letter').first().click();
  await p.waitForTimeout(2500);
  await p.screenshot({ path: `${OUT}/card-${tag}.png` });
  await p.close();

  p = await open(w, h);
  await board(p);
  await p.getByRole('button', { name: 'Board settings' }).click();
  await p.waitForTimeout(2500);
  await p.screenshot({ path: `${OUT}/settings-${tag}.png` });
  await p.close();
  console.log(tag, 'captured');
}
await b.close();
