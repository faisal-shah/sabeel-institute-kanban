// Seed the emulators with something worth looking at, by driving the UI.
//
// Deliberately NOT direct Firestore writes: going through the app exercises the
// same callables and rules a real user hits, so a seed that succeeds is also
// evidence the flow works. It also means the seed cannot drift from the schema.
//
// Usage: npm run seed  (emulators + `npm run dev:web` must already be running)
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';

const BASE = process.env.E2E_BASE ?? 'http://127.0.0.1:8086/';

// Seed the shapes that BREAK layouts, not just tidy ones. Every phone-layout bug
// filmed so far needed one of these two and the seed had neither, so the board
// looked fine locally and wrong on a real board:
//
//   - a column name too long for the phone pager, which used to paint over the
//     "‹ Prev" button;
//   - a column with more cards than fit on one screen, which is what exposed a
//     content-sized list on web (last card clipped, "+ Add card" unreachable,
//     nothing scrolling).
const LONG_COLUMN = 'Fundraising Strategy & Community Outreach';
const COLUMNS = [LONG_COLUMN, 'Blocked', 'Review', 'Ready to ship', 'Waiting on donor', 'Parked'];
const CARDS = [
  'Book the venue',
  'Confirm the caterer',
  'Draft the donor letter',
  'Design the programme',
  'Chase outstanding pledges',
  'Brief the volunteers',
  'Confirm exact ask based on rental vs. property',
  'Set total dollar target for the fundraiser',
  'Approve suggested giving levels and what each enables',
  'Reserve the overflow parking',
  'Order the printed programmes',
  'Line up the sound system',
  'Write the thank-you letter template',
  'Reconcile the pledge spreadsheet',
];

async function open(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  page.on('dialog', (d) => d.accept());
  await page.goto(BASE, { waitUntil: 'networkidle' });
  return page;
}

const browser = await chromium.launch();

/** Did this account land on the approval gate, or is it already through? */
async function signIn(page, who) {
  await page.getByRole('button', { name: who, exact: true }).click();
  const gate = page.getByText('Waiting for approval');
  const through = page.getByText('Boards', { exact: true });
  await Promise.race([
    gate.waitFor({ timeout: 40000 }).catch(() => {}),
    through.waitFor({ timeout: 40000 }).catch(() => {}),
  ]);
  return gate.isVisible().catch(() => false);
}

// The first account has to be granted out of band — there is no admin yet to
// approve it. That is the same bootstrap a real deployment goes through.
//
// Every step below is skipped if it has already happened, so the seed can be
// re-run against an emulator that is partly populated (an interrupted run, or a
// session where you already signed in) without erroring or duplicating.
const admin = await open(browser);
if (await signIn(admin, 'faisal')) {
  execFileSync('bash', ['scripts/grant-admin.sh', 'faisal@oursabeel.com'], {
    stdio: 'inherit',
  });
}
await admin.getByRole('button', { name: 'New board' }).waitFor({ timeout: 40000 });

// Two colleagues sign in and wait, then get approved.
for (const who of ['sara', 'omar']) {
  const p = await open(browser);
  await signIn(p, who);
}
// Section/account actions live in the app-wide nav now: People is inside the
// Account menu (bottom of the left rail on wide, where this seed runs).
await admin.getByRole('button', { name: 'Account' }).click();
await admin.getByRole('button', { name: 'People' }).click();
await admin.getByText('People', { exact: true }).waitFor({ timeout: 25000 });
for (;;) {
  const approve = admin.getByRole('button', { name: 'Approve' }).first();
  if (!(await approve.isVisible().catch(() => false))) break;
  await approve.click();
  await admin.waitForTimeout(1500);
}
await admin.getByRole('button', { name: 'Back' }).first().click();

// A board with MANY columns — the case that shows whether the layout holds up.
//
// Wait for the board LIST to actually render before deciding whether the board
// exists. Sampling it immediately reports "not found" while the live query is
// still in flight, so every re-run created another duplicate board — which is
// how five "Fundraising 2026" boards appeared in one session.
await admin.getByRole('button', { name: 'New board' }).waitFor({ timeout: 30000 });
await admin.waitForTimeout(2500);
const existing = admin.getByText('Fundraising 2026').first();
if (await existing.isVisible().catch(() => false)) {
  await existing.click();
} else {
  await admin.getByRole('button', { name: 'New board' }).click();
  await admin.getByPlaceholder('Board name').fill('Fundraising 2026');
  await admin.getByRole('button', { name: 'Create', exact: true }).click();
}
await admin.getByText('To Do').first().waitFor({ timeout: 30000 });

await admin.getByRole('button', { name: 'Board settings' }).click();
await admin.getByText('Board settings').waitFor({ timeout: 25000 });
for (const name of COLUMNS) {
  if (await admin.getByText(name).first().isVisible().catch(() => false)) continue;
  await admin.getByPlaceholder('New column name').fill(name);
  await admin.getByRole('button', { name: 'Add column' }).click();
  await admin.getByText(name).first().waitFor({ timeout: 25000 });
}
// Let the column writes settle: the settings controls disable while one is in
// flight, and firing the next click into a disabled button just times out.
await admin.waitForTimeout(2000);
for (const label of ['urgent', 'donor-facing']) {
  if (await admin.getByText(label).first().isVisible().catch(() => false)) continue;
  try {
    await admin.getByPlaceholder('New label name').fill(label);
    await admin.getByRole('button', { name: 'Add label' }).click({ timeout: 15000 });
    await admin.getByText(label).first().waitFor({ timeout: 25000 });
  } catch {
    // Labels are decoration for a dev seed; a board without them is still
    // worth testing, so this must not abort the run.
    console.warn(`could not seed label "${label}" — continuing`);
  }
}
// Everyone available gets added, so assignment and @mentions have real targets.
for (;;) {
  const add = admin.getByRole('button', { name: 'Add', exact: true }).first();
  if (!(await add.isVisible().catch(() => false))) break;
  await add.click();
  await admin.waitForTimeout(1200);
}
await admin.getByRole('button', { name: 'Back' }).first().click();
await admin.getByText('To Do').first().waitFor({ timeout: 30000 });

for (const title of CARDS) {
  if (await admin.getByText(title).first().isVisible().catch(() => false)) continue;
  await admin.getByRole('button', { name: '+ Add card' }).first().click();
  await admin.getByPlaceholder('Card title').fill(title);
  await admin.keyboard.press('Enter');
  await admin.getByText(title).first().waitFor({ timeout: 25000 });
}

await browser.close();
console.log(`Seeded: 3 people, 1 board, ${COLUMNS.length + 3} columns, ${CARDS.length} cards.`);
console.log(`Open ${BASE} and use the dev sign-in row.`);
