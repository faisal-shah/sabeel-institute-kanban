/**
 * Card attachments, end to end through the real web build.
 *
 * A focused suite rather than a section of `web-e2e.mjs`, because that script
 * exercises 40-odd checks of access and board flow first and any rot in them
 * blocks everything after. This drives the shortest path to a card and then the
 * whole attachment lifecycle: pick, upload, finalize, open, fail, remove.
 *
 *   bash scripts/e2e.sh scripts/attachments-e2e.mjs
 *
 * What this canNOT prove, and no local run can: production URL signing. The
 * Storage emulator has no signing service, so `getAttachmentUrl` takes a
 * different branch here, and the IAM grant it needs fails only in production.
 * Inline-vs-download is likewise only truly exercised by real GCS.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const BASE = process.env.E2E_BASE ?? 'http://127.0.0.1:8086/';
const SHOTS = resolve(import.meta.dirname, '..', 'shots');

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}

function grantAdmin(email) {
  return new Promise((res, rej) => {
    const child = spawn('node', [resolve(import.meta.dirname, 'grant-admin.mjs'), email], {
      env: {
        ...process.env,
        GCLOUD_PROJECT: 'demo-sabeel-kanban',
        FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
        FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
      },
      stdio: 'pipe',
    });
    child.on('exit', (code) => (code === 0 ? res() : rej(new Error(`grant-admin exited ${code}`))));
  });
}

await mkdir(SHOTS, { recursive: true });
const browser = await chromium.launch();
let page;

try {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 900 } });
  page = await ctx.newPage();
  // Removal asks for confirmation; Playwright dismisses dialogs by default, so
  // without this the delete silently does nothing and looks like a dead button.
  page.on('dialog', (d) => d.accept());
  page.on('pageerror', (e) => console.error('   page error:', String(e)));
  await page.goto(BASE, { waitUntil: 'networkidle' });

  await page.getByText('Dev sign-in (emulator only)').waitFor({ timeout: 20000 });
  await page.getByRole('button', { name: 'faisal', exact: true }).click();
  await page.getByText('Waiting for approval').waitFor({ timeout: 25000 });
  await grantAdmin('faisal@oursabeel.com');
  await page.getByRole('button', { name: 'New board' }).waitFor({ timeout: 25000 });

  // A board and one card to hang files on.
  await page.getByRole('button', { name: 'New board' }).click();
  {
    const name = page.getByPlaceholder('Board name');
    await name.waitFor({ timeout: 15000 });
    await name.click();
    await name.pressSequentially('Files', { delay: 10 });
    await name.press('Enter');
  }
  await page.getByText('To Do').first().waitFor({ timeout: 25000 });
  await page.getByRole('button', { name: '+ Add card' }).first().click();
  {
    // Real keystrokes: fill() sets the value and fires one event a controlled
    // React input can miss, leaving state empty while the DOM looks right.
    const title = page.getByPlaceholder('Card title');
    await title.waitFor({ timeout: 15000 });
    await title.click();
    await title.pressSequentially('Has attachments', { delay: 10 });
    await title.press('Enter');
  }
  const tile = page.locator('[data-testid="card-Has attachments"]');
  await tile.waitFor({ timeout: 25000 });
  await tile.click();
  await page.getByRole('button', { name: 'Attach a file' }).waitFor({ timeout: 20000 });
  check('the card detail offers an attach control', true);

  // ---- Upload -------------------------------------------------------------
  {
    const chooser = page.waitForEvent('filechooser', { timeout: 20000 });
    await page.getByRole('button', { name: 'Attach a file' }).click();
    // setFiles from memory, so this needs no fixture on disk.
    await (await chooser).setFiles({
      name: 'budget.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4\n% e2e fixture\n%%EOF\n'),
    });
  }
  // Reaching a ready row means the bytes landed AND finalizeAttachment
  // confirmed them — the size shown is the one the server read off the object.
  await page.getByText(/PDF ·/).waitFor({ timeout: 40000 });
  check('a file uploads and the row settles to ready', true);
  await page.screenshot({ path: join(SHOTS, 'attach-card-light.png'), fullPage: true });

  // WAIT for it, do not sample it. The activity entry is written by the callable
  // and reaches the screen through a SEPARATE live query, so it lands after the
  // row itself changes. `isVisible()` checks once, instantly, and wins that race
  // on a fast machine and loses it on a slower CI runner — which is exactly how
  // this failed in CI while passing locally every time.
  check(
    'attaching is recorded in the card activity',
    await page
      .getByText(/attached budget\.pdf/)
      .waitFor({ timeout: 20000 })
      .then(() => true)
      .catch(() => false),
  );

  // ---- Open ---------------------------------------------------------------
  // Opened with a PNG rather than the PDF, and that is not incidental: headless
  // Chromium ships no PDF viewer, so navigating to one triggers a DOWNLOAD and
  // leaves the tab sitting at about:blank. The navigation had happened; the
  // assertion was reading a browser limitation as a broken feature.
  {
    const chooser = page.waitForEvent('filechooser', { timeout: 20000 });
    await page.getByRole('button', { name: 'Attach a file' }).click();
    await (await chooser).setFiles({
      name: 'diagram.png',
      mimeType: 'image/png',
      buffer: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
        'base64',
      ),
    });
  }
  await page.getByText(/PNG ·/).waitFor({ timeout: 40000 });

  {
    const popup = page.waitForEvent('popup', { timeout: 20000 });
    await page.getByRole('button', { name: 'Open diagram.png' }).click();
    const tab = await popup.catch(() => null);
    check('tapping a file opens it in a new tab', tab !== null);
    if (tab) {
      // The tab is opened SYNCHRONOUSLY on the tap (or the popup blocker eats
      // it) and only navigated once the signed URL comes back from the
      // callable, so it is legitimately about:blank for a moment. Wait for the
      // navigation rather than sampling the URL straight away.
      const navigated = await tab
        .waitForURL((u) => String(u) !== 'about:blank', { timeout: 20000 })
        .then(() => true)
        .catch(() => false);
      check('the opened tab navigates to the stored object', navigated, tab.url().slice(0, 90));
      await tab.close();
    }
  }

  // ---- A second tap while a file is still opening --------------------------
  // Opening is slow and used to be SILENT: the signed URL is minted by a
  // callable and native then downloads the whole file, so nothing about the row
  // changed for seconds. Someone tapped again, and on Android the duplicate
  // reached expo-sharing — which keeps one pending promise and rejected it, so a
  // member got "Call to function 'ExpoSharing.shareAsync' has been rejected"
  // (Sentry, 2026-07-27).
  //
  // The gate is a ref, checked synchronously, because both `busy` and the
  // opening row are React state and a second tap in the same frame reads the
  // value from before the first. Delaying the callable holds the window open
  // wide enough to tap into deliberately.
  {
    await page.route('**/getAttachmentUrl', async (r) => {
      await new Promise((res) => setTimeout(res, 6000));
      await r.continue();
    });

    // Collected, NOT closed on arrival. The open path checks `tab.closed` and
    // falls back to navigating the current page when the popup is gone — so
    // closing it early sends the APP to the signed URL and every later check
    // fails against a page that is no longer the app.
    const opened = [];
    const countPopup = (p) => opened.push(p);
    page.on('popup', countPopup);

    await page.getByRole('button', { name: 'Open diagram.png' }).click();

    const announced = await page
      .getByText('Opening…')
      .waitFor({ timeout: 10000 })
      .then(() => true)
      .catch(() => false);
    check('the row says it is opening rather than sitting silent', announced);

    // `force` so this is a real test of the GATE, not of the disabled attribute:
    // a click that actually lands must still be dropped.
    await page
      .getByRole('button', { name: 'Opening diagram.png' })
      .click({ force: true, timeout: 10000 })
      .catch(() => {});

    // Let the delayed callable land before unrouting — disposing a route while
    // its handler is still sleeping makes the pending continue() throw.
    await page.waitForTimeout(9000);
    await page.unroute('**/getAttachmentUrl');
    page.off('popup', countPopup);

    check(
      'a second tap while a file is opening is ignored',
      opened.length === 1,
      `${opened.length} tab(s)`,
    );
    check(
      'the row goes back to offering the file once it has opened',
      await page
        .getByRole('button', { name: 'Open diagram.png' })
        .waitFor({ timeout: 15000 })
        .then(() => true)
        .catch(() => false),
    );
    for (const p of opened) await p.close().catch(() => {});
  }

  // ---- The upload actually SHOWS something ---------------------------------
  // The progress bar is the only feedback during an upload, and it is easy for
  // it to render invisibly — the first version painted accentSoft on inset,
  // 1.13:1, so it showed nothing at all while working perfectly. Slow the
  // confirm step so the state persists, then capture it and look.
  await page.route('**/finalizeAttachment', async (r) => {
    await new Promise((res) => setTimeout(res, 6000));
    await r.continue();
  });
  {
    const chooser = page.waitForEvent('filechooser', { timeout: 20000 });
    await page.getByRole('button', { name: 'Attach a file' }).click();
    await (await chooser).setFiles({
      name: 'slow.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('watch the bar'),
    });
  }
  // Wait for "Finishing…" specifically — that is fraction 1, i.e. a FULL bar.
  // "Preparing…" is fraction null and paints an empty track, which would prove
  // only that the track exists, not that the fill is visible. The fill is the
  // part that was invisible before.
  await page.getByText(/Finishing/).waitFor({ timeout: 20000 });
  check('an upload in flight shows a filled progress bar, not a blank row', true);
  await page.screenshot({ path: join(SHOTS, 'attach-uploading.png'), fullPage: true });
  // Let the DELAYED confirm land before removing the route. Unrouting while the
  // handler is still sleeping disposes the route, and its continue() then throws
  // "Route is already handled".
  await page.getByText(/TXT ·/).first().waitFor({ timeout: 40000 });
  await page.unroute('**/finalizeAttachment');

  // ---- The failure path that actually works -------------------------------
  // Going offline does NOT fail a resumable upload: it resumes and finishes, so
  // "kill the network" is a false-negative generator. Block the CONFIRMATION
  // instead — bytes land, finalize never does — which is a real failure mode
  // (bytes in Storage, no usable record) and fails fast.
  await page.route('**/finalizeAttachment', (r) => r.abort());
  {
    const chooser = page.waitForEvent('filechooser', { timeout: 20000 });
    await page.getByRole('button', { name: 'Attach a file' }).click();
    await (await chooser).setFiles({
      name: 'doomed.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('this upload never gets confirmed'),
    });
  }
  await page.waitForTimeout(8000);
  await page.unroute('**/finalizeAttachment');
  // The client rolls back through deleteAttachment, so the half-made row must
  // be GONE rather than stuck pretending to upload forever.
  check(
    'a failed confirmation leaves no half-uploaded row',
    !(await page.getByText('doomed.txt').isVisible().catch(() => false)),
  );
  check(
    'the good file is untouched by the failed one',
    await page.getByText(/PDF ·/).isVisible().catch(() => false),
  );

  // ---- A filename the rules would refuse ----------------------------------
  // 300 characters plus a quote. The rules cap the name, so without the client
  // sanitising first this fails with a raw permission-denied on an ordinary
  // attachment; and because the server sanitises anyway, an unsanitised row
  // would visibly RENAME itself the instant the upload finished.
  {
    const nasty = `${'x'.repeat(300)}"quote.txt`;
    const chooser = page.waitForEvent('filechooser', { timeout: 20000 });
    await page.getByRole('button', { name: 'Attach a file' }).click();
    await (await chooser).setFiles({
      name: nasty,
      mimeType: 'text/plain',
      buffer: Buffer.from('long name'),
    });
    await page.getByText(/TXT ·/).waitFor({ timeout: 40000 });
    check('an over-long, quote-bearing filename still uploads', true);
    check(
      'and it is not left holding a quote',
      !(await page.getByText(/"quote\.txt/).isVisible().catch(() => false)),
    );
  }

  // ---- The BOARD badges the card ------------------------------------------
  // The board only fetches card documents, so this proves the denormalised
  // count reached the card and the tile reads it.
  await page.getByRole('button', { name: 'Back' }).first().click();
  await page.getByText('To Do').first().waitFor({ timeout: 25000 });
  const badged = await page
    .getByText(/\d+ files?/)
    .first()
    .waitFor({ timeout: 20000 })
    .then(() => true)
    .catch(() => false);
  check('the board tile badges a card that has files', badged);
  await page.screenshot({ path: join(SHOTS, 'attach-board-badge.png'), fullPage: true });
  await tile.click();
  await page.getByRole('button', { name: 'Attach a file' }).waitFor({ timeout: 20000 });

  // ---- Remove -------------------------------------------------------------
  await page.getByRole('button', { name: 'Remove budget.pdf' }).click();
  await page.getByText(/PDF ·/).waitFor({ state: 'detached', timeout: 25000 });
  check('a file can be removed', true);
  // Same race as the attach entry above, and this is the one CI actually caught:
  // the row was gone 10ms before the check ran, but the "removed" line had not
  // arrived yet.
  check(
    'removal is recorded, naming who did it',
    await page
      .getByText(/removed budget\.pdf/)
      .waitFor({ timeout: 20000 })
      .then(() => true)
      .catch(() => false),
  );
  await page.screenshot({ path: join(SHOTS, 'attach-removed-light.png'), fullPage: true });

  // ---- Phone width --------------------------------------------------------
  // Every feature ships with a phone design; the section must not blow up the
  // one-column layout.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: join(SHOTS, 'attach-card-narrow.png'), fullPage: true });
  check('the attachments section renders at phone width', true);
} catch (e) {
  console.error('\nAttachments E2E aborted:', e instanceof Error ? e.message : String(e));
  if (page) {
    try {
      console.error(`\n--- page showed ---\n${await page.locator('body').innerText()}\n---`);
      await page.screenshot({ path: join(SHOTS, 'attach-FAIL.png'), fullPage: true });
    } catch {
      /* the page is gone; the message above is all there is */
    }
  }
  process.exitCode = 1;
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  console.error('FAILED:', failed.map((f) => f.name).join(', '));
  process.exit(1);
}
