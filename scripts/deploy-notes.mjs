// Extract release notes (or the title) for a version from the PHASE_STATUS
// deploy log, so the app-repo GitHub Release stays in sync with the one
// source of truth. Deploy-log entries are headed `### DATE — SUMMARY — vX.Y.Z`.
//
//   node scripts/deploy-notes.mjs 0.1.16           # -> the entry body (notes)
//   node scripts/deploy-notes.mjs 0.1.16 --title   # -> "v0.1.16 — SUMMARY"
import { readFileSync } from 'node:fs';

const version = process.argv[2];
const wantTitle = process.argv.includes('--title');
if (!version) { process.stderr.write('usage: deploy-notes.mjs <version> [--title]\n'); process.exit(2); }

const md = readFileSync(new URL('../docs/PHASE_STATUS.md', import.meta.url), 'utf8');
const lines = md.split('\n');
const esc = version.replace(/\./g, '\\.');
const headRe = new RegExp(`^###\\s+.*\\bv${esc}\\b`);

const i = lines.findIndex((l) => headRe.test(l));
if (i < 0) { process.stderr.write(`no deploy-log entry for v${version}\n`); process.exit(1); }

// Summary is the middle of `### DATE — SUMMARY — vX.Y.Z`.
const m = lines[i].match(/^###\s+\S+\s+[—-]\s+(.*?)\s+[—-]\s+v/);
const summary = m ? m[1].trim() : '';

if (wantTitle) {
  console.log(summary ? `v${version} — ${summary}` : `v${version}`);
  process.exit(0);
}

const body = [];
for (let j = i + 1; j < lines.length; j++) {
  if (/^#{2,3}\s/.test(lines[j])) break; // next entry or section
  body.push(lines[j]);
}
console.log(body.join('\n').trim());
