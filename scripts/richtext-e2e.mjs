/**
 * Rich text, proved end to end against the REAL editor and REAL storage.
 *
 *   bash scripts/e2e.sh scripts/richtext-e2e.mjs
 *
 * The load-bearing check is THREE CYCLES OF BYTE EQUALITY: type, save, read the
 * stored string, reload so the editor rehydrates from markdown rather than from
 * memory, save again untouched, and assert the bytes have not moved. A converter
 * that loses something loses it on cycle two — here, in one comparison, rather
 * than in somebody's real notes weeks later.
 *
 * Everything else in here exists because it cannot be proved in a unit test:
 * that the editor actually mounts, that a paste is reduced by the time it
 * reaches Firestore, that the cap gate blocks the WRITE and not just the button,
 * and that a mid-text mention resolves to a uid.
 *
 * WEB ONLY. There is no native e2e harness in this repo, so the Android editor
 * is covered by the device checklist in docs/PHASE_STATUS.md instead — the same
 * split `attachments-e2e.mjs` documents for signed URLs.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const BASE = process.env.E2E_BASE ?? 'http://127.0.0.1:8086/';
const ROOT = resolve(import.meta.dirname, '..');
const PROJECT = 'demo-sabeel-kanban';
process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= '127.0.0.1:9099';
process.env.GCLOUD_PROJECT = PROJECT;

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${!ok && detail ? ` — ${detail}` : ''}`);
}

const browser = await chromium.launch();
const grant = (email) =>
  new Promise((res, rej) => {
    const c = spawn('node', [resolve(ROOT, 'scripts/grant-admin.mjs'), email], {
      env: { ...process.env },
      stdio: 'pipe',
    });
    c.on('exit', (code) => (code === 0 ? res() : rej(new Error(`grant-admin ${code}`))));
  });

async function provision(who, email) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  await p.goto(BASE, { waitUntil: 'networkidle' });
  await p.getByText('Dev sign-in (emulator only)').waitFor({ timeout: 20000 });
  await p.getByRole('button', { name: who, exact: true }).click();
  await p.getByText('Waiting for approval').waitFor({ timeout: 25000 });
  await grant(email);
  await ctx.close();
}
await provision('faisal', 'faisal@oursabeel.com');
await provision('sara', 'sara@oursabeel.com');

initializeApp({ projectId: PROJECT });
const db = getFirestore();
const users = await db.collection('users').get();
const uid = users.docs.find((d) => d.data().email === 'faisal@oursabeel.com').id;
const sara = users.docs.find((d) => d.data().email === 'sara@oursabeel.com').id;
const now = Date.now();

await db.doc('boards/rt_b').set({
  name: 'Rich text',
  description: '',
  archived: false,
  columns: [{ id: 'c1', name: 'To Do' }],
  columnIds: ['c1'],
  memberUids: [uid, sara],
  memberProfiles: {
    [uid]: { displayName: 'Faisal', email: 'faisal@oursabeel.com' },
    [sara]: { displayName: 'Sara', email: 'sara@oursabeel.com' },
  },
  activeCardCount: 1,
  createdAt: now,
  createdBy: uid,
});
await db.doc('cards/rt_c').set({
  boardId: 'rt_b', title: 'Formatting', description: '', columnId: 'c1', rank: 'V0',
  priority: 'none', assigneeUids: [], subscriberUids: [], labelIds: [], archived: false,
  commentCount: 0, createdAt: now, createdBy: uid, updatedAt: now, updatedBy: uid,
});

const ctx = await browser.newContext({ viewport: { width: 1100, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 120)));

async function openTheCard() {
  await page.getByRole('button', { name: 'More' }).waitFor({ timeout: 30000 });
  await page.getByRole('button', { name: 'Boards', exact: true }).first().click();
  await page.getByText('Rich text').first().click();
  await page.waitForTimeout(800);
  await page.getByText('Formatting').first().click();
  await page.getByRole('button', { name: 'Share card' }).waitFor({ timeout: 25000 });
}

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'faisal', exact: true }).click();
await openTheCard();

// ---- the editor, and what it stores ---------------------------------------
await page.getByRole('button', { name: 'Edit description' }).click();
await page.waitForTimeout(700);
// The DESCRIPTION editor. The comment composer is another contenteditable
// on the same screen, which is why every editor-scoped locator here is .first().
const editor = page.locator('[contenteditable="true"]').first();
check('the editor mounts', await editor.isVisible().catch(() => false));

await editor.click();
await page.keyboard.type('hello world and 2 * 3 * 4');
await page.keyboard.press('Home');
for (let i = 0; i < 6; i += 1) await page.keyboard.press('ArrowRight');
await page.keyboard.down('Shift');
for (let i = 0; i < 5; i += 1) await page.keyboard.press('ArrowRight');
await page.keyboard.up('Shift');
await page.getByRole('button', { name: 'Bold', exact: true }).first().click();
await page.waitForTimeout(250);
check(
  'an active mark reports its state to a screen reader',
  (await page.getByRole('button', { name: 'Bold', exact: true }).first().getAttribute('aria-pressed')) ===
    'true',
);
/*
 * The editor must LOOK like the app.
 *
 * Lexical's ContentEditable is a real DOM element, and react-native-web puts
 * its font stack on each `Text` it renders rather than on `body` — so the
 * editable inherits nothing and falls back to the UA serif. Comparing computed
 * styles against a genuinely rendered control is the check; hardcoding the
 * expected stack here would just restate the bug's assumption.
 */
const fonts = await page.evaluate(() => {
  const norm = (v) => v.replace(/\s+/g, '').replace(/"/g, '').toLowerCase();
  const ed = document.querySelector('[contenteditable="true"]');
  const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let probe = null;
  while (walk.nextNode()) {
    if (walk.currentNode.textContent.trim() === 'Save') {
      probe = walk.currentNode.parentElement;
      break;
    }
  }
  const es = getComputedStyle(ed);
  return {
    editor: norm(es.fontFamily),
    app: probe ? norm(getComputedStyle(probe).fontFamily) : null,
    size: es.fontSize,
    serif: /(^|,)(times|serif)/.test(norm(es.fontFamily)),
  };
});
check(
  'the editor uses the app font, not the browser default',
  fonts.app !== null && fonts.editor === fonts.app && !fonts.serif,
  JSON.stringify(fonts),
);
check('and the app body size', fonts.size === '15px', fonts.size);

await page.keyboard.press('End');
await page.keyboard.press('Enter');
await page.getByRole('button', { name: 'Bullet list', exact: true }).first().click();
await page.keyboard.type('first');
await page.getByRole('button', { name: 'Save' }).first().click();
await page.waitForTimeout(1500);

const first = (await db.doc('cards/rt_c').get()).data().description;
check('bold is stored as markdown', first.includes('**world**'), first);
check('a literal asterisk is escaped', first.includes('\\*'), first);
check('a bullet is stored', first.includes('- first'), first);
check('no HTML reaches storage', !/[<>]/.test(first), first);

// ---- three cycles, byte for byte ------------------------------------------
let previous = first;
let stable = true;
for (let cycle = 1; cycle <= 2; cycle += 1) {
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(2500);
  await openTheCard();
  await page.getByRole('button', { name: 'Edit description' }).click();
  await page.waitForTimeout(900);
  await page.getByRole('button', { name: 'Save' }).first().click();
  await page.waitForTimeout(1500);
  const again = (await db.doc('cards/rt_c').get()).data().description;
  if (again !== previous) stable = false;
  previous = again;
}
check('byte-identical after two reload-and-resave cycles', stable, JSON.stringify(previous));

// ---- paste is reduced BEFORE it is stored ---------------------------------
await page.getByRole('button', { name: 'Edit description' }).click();
await page.waitForTimeout(700);
await editor.click();
await page.keyboard.press('Control+a');
await page.evaluate(() => {
  const el = document.querySelector('[contenteditable="true"]');
  const dt = new DataTransfer();
  dt.setData(
    'text/html',
    '<h1>Heading</h1><p><u>under</u> and <s>struck</s> and <a href="https://ok.test">a link</a></p>' +
      '<ul><li>kept</li></ul><img src="x.png"><scr' + 'ipt>alert(1)</scr' + 'ipt>',
  );
  el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
});
await page.waitForTimeout(800);
await page.getByRole('button', { name: 'Save' }).first().click();
await page.waitForTimeout(1500);
const pasted = (await db.doc('cards/rt_c').get()).data().description;
check('a rich paste is reduced to the vocabulary', !/[<>]/.test(pasted), pasted);
check('the paste kept its link', pasted.includes('https://ok.test'), pasted);
check('the paste kept its list item', pasted.includes('kept'), pasted);
check('the paste dropped the script', !pasted.includes('alert(1)'), pasted);

// ---- the cap blocks the WRITE, not just the button ------------------------
const before = (await db.doc('cards/rt_c').get()).data().description;
await page.getByRole('button', { name: 'Edit description' }).click();
await page.waitForTimeout(600);
await editor.click();
await page.keyboard.press('Control+a');
await page.evaluate(() => {
  const el = document.querySelector('[contenteditable="true"]');
  const dt = new DataTransfer();
  dt.setData('text/plain', 'x'.repeat(25000));
  el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
});
await page.waitForTimeout(1200);
const saveBtn = page.getByRole('button', { name: 'Save' }).first();
check('Save is refused past the cap', (await saveBtn.getAttribute('aria-disabled')) === 'true');
await saveBtn.click({ force: true }).catch(() => {});
await page.waitForTimeout(1200);
check(
  'and NO write happened — the regression test for a bare permission-denied',
  (await db.doc('cards/rt_c').get()).data().description === before,
);
await page.getByRole('button', { name: 'Cancel' }).first().click().catch(() => {});

/**
 * EDITING A COMMENT MUST NOT REWRITE THE MARKUP IT DID NOT TOUCH.
 *
 * The round trip is proven here for descriptions and for newly posted
 * comments, but never for the EDIT path — which is a second `RichEditor` with
 * a second seed, re-parsing stored markdown back into a document and
 * serialising it out again. A seed or a serialiser that differed by one
 * character would silently rewrite every comment anyone edits, and the only
 * evidence would be in the stored bytes: the rendered comment looks the same
 * either way, which is exactly why this is asserted against Firestore.
 *
 * Runs before the mention section, where this card still has NO comments, so
 * `.first()` can only mean the comment posted here.
 */
await page.waitForTimeout(500);
const editBox = page.locator('[data-testid="comment-editor"]');
await editBox.click();
await page.keyboard.type('keep this exactly');
await page.getByRole('button', { name: 'Comment', exact: true }).click();
await page.waitForTimeout(2000);

const posted = (await db.collection('cards/rt_c/comments').get()).docs[0];
const postedBody = posted.data().body;

await page.getByRole('button', { name: 'Edit comment' }).first().click();
const editArea = page.locator('[data-testid="comment-edit-editor"]');
await editArea.waitFor({ timeout: 20000 });
await editArea.click();
await page.keyboard.press('Control+End');
await page.keyboard.type(' plus more');
await page.getByRole('button', { name: 'Save', exact: true }).first().click();
await page.waitForTimeout(2000);

const editedBody = (await db.doc(`cards/rt_c/comments/${posted.id}`).get()).data().body;
check(
  'editing a comment appends without rewriting the stored markdown',
  editedBody === `${postedBody} plus more`,
  `stored ${JSON.stringify(editedBody)}, expected ${JSON.stringify(`${postedBody} plus more`)}`,
);
check('the edit is recorded as an edit', !!(await db.doc(`cards/rt_c/comments/${posted.id}`).get()).data().editedAt);

// ---- a mid-text mention resolves to a uid ---------------------------------
await page.waitForTimeout(500);
const box = page.locator('[data-testid="comment-editor"]');
await box.click();
await page.keyboard.type('please review this before Friday');
await page.keyboard.press('Home');
for (let i = 0; i < 14; i += 1) await page.keyboard.press('ArrowRight');
await page.keyboard.type(' @sa');
await page.waitForTimeout(900);
const rows = page.getByRole('button', { name: /^Mention / });
check('the mention list opens MID-TEXT, which the plain box cannot do', (await rows.count()) > 0);
if (await rows.count()) await rows.first().click();
await page.waitForTimeout(500);
await page.getByRole('button', { name: 'Comment', exact: true }).click();
await page.waitForTimeout(2000);
// BY CONTENT, not by index. This card now holds the comment the edit check
// posted as well, and `docs[0]` is document-id order — which would pick either
// one and make this check pass or fail for reasons that have nothing to do with
// mentions.
const comment = (await db.collection('cards/rt_c/comments').get()).docs
  .map((d) => d.data())
  .find((d) => d.body.includes('please review'));
check('the mention resolved to a uid', !!comment && comment.mentionUids.includes(sara));
check('the handle is literal text in the stored markdown', !!comment && comment.body.includes('@'));

/**
 * A SPACE typed into a sheet must not dismiss it.
 *
 * `accessibilityRole="button"` on the Sheet backdrop made react-native-web
 * render a real <button> wrapping the whole dialog, TextInput included; the
 * browser then treated a space in the field as activating it and the sheet shut
 * mid-word. Reported from production on a label called "waiting on".
 *
 * Lives here rather than in a unit test because it only exists in the DOM: the
 * component tree looks identical either way, and native never reproduces it.
 * Reverting Sheet.tsx must make this check fail — that was verified when it was
 * written, and is the only reason to trust it.
 */
await page.getByRole('button', { name: 'New label' }).first().click();
await page.waitForTimeout(700);
const labelName = page.getByPlaceholder(/label name/i).first();
await labelName.click();
await labelName.type('waiting', { delay: 20 });
await page.keyboard.press('Space');
await page.waitForTimeout(400);
const sheetSurvived =
  (await labelName.count()) > 0 && (await labelName.isVisible().catch(() => false));
const typed = sheetSurvived ? await labelName.inputValue().catch(() => '') : '(sheet dismissed)';
check('a space in a sheet field does not dismiss the sheet', typed === 'waiting ', typed);
await page.keyboard.press('Escape').catch(() => {});
await page.waitForTimeout(300);

/**
 * THE LINK DIALOG, which had no coverage at all until a phone recording showed
 * three things wrong with it at once.
 *
 * What is provable from a browser is asserted here. What is NOT: the dead taps
 * that prompted this, which were `Sheet`'s ScrollView eating the press while a
 * field held focus — native responder behaviour with no DOM equivalent. That
 * one is held by the lint rule in eslint.config.mjs, because no Playwright
 * suite can see it and a check that cannot fail is worse than none.
 */
await page.getByRole('button', { name: 'Edit description' }).click();
await page.waitForTimeout(700);
await editor.click();
await page.keyboard.press('Control+a');
await page.keyboard.type('see the docs');
await page.waitForTimeout(300);
// Select the word "docs".
await page.keyboard.down('Shift');
for (let i = 0; i < 4; i += 1) await page.keyboard.press('ArrowLeft');
await page.keyboard.up('Shift');
await page.getByRole('button', { name: 'Link', exact: true }).first().click();
await page.getByPlaceholder('https://…').waitFor({ timeout: 15000 });
await page.waitForTimeout(600);

/*
 * The label is captured when the sheet OPENS and nothing may put it back.
 *
 * It used to be read from the live editor selection on every parent render,
 * with an effect reseeding both fields whenever that value changed — and
 * opening the sheet moves focus off the editor, so the selection goes and the
 * effect fired again with "". Intermittent: 3 of 12 opens on the bench lost the
 * selected word, and a URL typed fast enough went with it. The wait above is
 * deliberately long enough for that second render to have happened.
 */
check(
  'the selected word prefills the link label',
  (await page.getByPlaceholder('Text to show').inputValue()) === 'docs',
  await page.getByPlaceholder('Text to show').inputValue(),
);
check(
  'Add link is refused until the address is one we would render',
  (await page.getByRole('button', { name: 'Add link' }).getAttribute('aria-disabled')) === 'true',
);
/*
 * One Cancel. `Sheet` supplies its own, and the sheet used to add a second
 * beside Add link — two identical buttons, one directly above the other.
 *
 * SCOPED TO THE DIALOG, which is the whole difficulty: the description editor
 * behind the modal has a Cancel of its own, and a page-wide count therefore
 * says 2 whether or not the bug is present. react-native-web's Modal renders
 * `role="dialog"` (ModalContent), so the overlay is addressable — and that is
 * the only thing separating "one dialog, one editor" from "two in the dialog".
 */
const dialog = page.getByRole('dialog');
check('the link dialog is addressable as a dialog', (await dialog.count()) === 1);
check(
  'the dialog offers exactly one Cancel',
  (await dialog.getByRole('button', { name: 'Cancel', exact: true }).count()) === 1,
  String(await dialog.getByRole('button', { name: 'Cancel', exact: true }).count()),
);

await page.getByPlaceholder('https://…').fill('javascript:alert(1)');
await page.waitForTimeout(400);
check(
  'and a scheme the renderer would drop is refused here too',
  (await page.getByRole('button', { name: 'Add link' }).getAttribute('aria-disabled')) === 'true',
);

await page.getByPlaceholder('https://…').fill('https://ok.test/page');
await page.waitForTimeout(400);
await page.getByRole('button', { name: 'Add link' }).click();
await page.getByPlaceholder('https://…').waitFor({ state: 'detached', timeout: 20000 });
await page.getByRole('button', { name: 'Save' }).first().click();
await page.waitForTimeout(1500);
const linked = (await db.doc('cards/rt_c').get()).data().description;
check(
  'the link is stored as markdown, over the words that were selected',
  linked.includes('[docs](https://ok.test/page)'),
  linked,
);

check('no page errors', errors.length === 0, errors.join(' | '));
await page.screenshot({ path: 'shots/richtext-e2e.png', fullPage: true });
await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  console.error(`FAILED: ${failed.map((f) => f.name).join('; ')}`);
  process.exit(1);
}
