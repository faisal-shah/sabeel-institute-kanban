// Screenshot the exported web build.
//
// UI changes are verified by LOOKING, not by reading code. The app is a single
// light theme (no dark mode), so one capture is the whole story. Run after
// `npm run web:export -w @sabeel/app`.
//
//   node scripts/web-shot.mjs [outDirName]
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..', 'app', 'dist-web');
const OUT = resolve(import.meta.dirname, '..', process.argv[2] ?? 'shots');
const PORT = 4173;

const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
};

const server = createServer(async (req, res) => {
  const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  for (const candidate of [join(ROOT, urlPath), join(ROOT, 'index.html')]) {
    try {
      const body = await readFile(candidate);
      res.writeHead(200, { 'Content-Type': MIME[extname(candidate)] ?? 'application/octet-stream' });
      return res.end(body);
    } catch {
      // fall through to the SPA index
    }
  }
  res.writeHead(404).end('not found');
});

/**
 * Console errors this app cannot prevent, matched EXACTLY so a real one still fails.
 *
 * React Native's own app-root renderer (`Libraries/ReactNative/renderApplication.js`)
 * imports BackHandler unconditionally, to install the default handler that exits
 * the app when no listener responds. Under react-native-web that import logs an
 * unsupported-API error at every startup. Nothing here calls BackHandler — the
 * app's Back is an in-app control — and there is no version of this app on this
 * React Native that does not print it.
 *
 * It was ignored rather than filtered for a long time, which cost this script its
 * meaning: it exited 1 on every single run, so "web-shot failed" stopped being
 * information. A check that always fails is not a check.
 */
const EXPECTED = ['BackHandler is not supported on web and should not be used.'];
const expected = (text) => EXPECTED.some((e) => text.includes(e));

await new Promise((r) => server.listen(PORT, r));
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch();
try {
  for (const scheme of ['light']) {
    const ctx = await browser.newContext({
      colorScheme: scheme,
      viewport: { width: 1280, height: 900 },
    });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => m.type() === 'error' && !expected(m.text()) && errors.push(m.text()));

    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(400);
    await page.screenshot({ path: join(OUT, `web-${scheme}.png`), fullPage: true });
    console.log(`wrote ${join(OUT, `web-${scheme}.png`)}`);
    if (errors.length) {
      console.error(`page errors (${scheme}):`, errors);
      process.exitCode = 1;
    }
    await ctx.close();
  }
} finally {
  await browser.close();
  server.close();
}
