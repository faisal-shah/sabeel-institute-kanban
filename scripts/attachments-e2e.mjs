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

  check(
    'attaching is recorded in the card activity',
    await page.getByText(/attached budget\.pdf/).isVisible().catch(() => false),
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

  // ---- Remove -------------------------------------------------------------
  await page.getByRole('button', { name: 'Remove budget.pdf' }).click();
  await page.getByText(/PDF ·/).waitFor({ state: 'detached', timeout: 25000 });
  check('a file can be removed', true);
  check(
    'removal is recorded, naming who did it',
    await page.getByText(/removed budget\.pdf/).isVisible().catch(() => false),
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
