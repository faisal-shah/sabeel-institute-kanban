# Migrating from ClickUp

A one-time, dev-side, human-in-the-loop move. It is **not** an app feature and
never ships to users.

It runs as a setup step **after** the production deploy (so there is somewhere
real to write) and **before** the team is let in (so it never races live edits).

The mapping is genuinely fuzzy — ClickUp usernames will not match Google
accounts, board and list names are being renamed as part of the move, and
statuses map imperfectly onto columns. So the tool never guesses. It proposes,
you correct, and anything unresolved is a hard error rather than a silent drop.

---

## Stage 1 — Export from ClickUp (Faisal)

### Option A: CSV (try this first)

1. In ClickUp, open the **Space** you want to move.
2. **⋯ (Space settings)** → **Export** (or from a List view: the **⋯** menu at
   top-right → **Export view**).
3. Choose **CSV**, and make sure these are ticked if offered: **Name**,
   **Description**, **Status**, **Assignees**, **Due date**, **Priority**,
   **Tags**, **List**, **Folder**, **Space**, **Comments**, **Date Created**.
4. Repeat per Space if the team uses more than one.
5. Drop the file(s) into `migration/` in this repo (gitignored — ClickUp exports
   contain personal data and must never be committed).

### Option B: API export (if the CSV drops things)

CSV commonly loses comment threads and sometimes assignee lists. If that
matters:

1. ClickUp → **Settings → Apps → API Token** → generate a personal token.
2. **Do not paste the token into chat.** Put it in `migration/.env`:
   ```
   CLICKUP_TOKEN=pk_xxx
   CLICKUP_TEAM_ID=xxxxx
   ```
3. Run `node scripts/clickup-fetch.mjs` — it walks Spaces → Folders → Lists →
   Tasks → Comments and writes `migration/clickup-export.json`.

**Show me a small sample either way** (5–10 rows, or one task's JSON) before the
full export. The exact CSV column names vary by ClickUp plan and view, and the
parser keys off them.

---

## Stage 2 — Reconcile (together)

```sh
node scripts/import-clickup.mjs --extract
```

Reads whatever is in `migration/` and writes **`migration/mapping.json`**: every
distinct person, list and status it found, each with a proposed target and a
confidence note. Nothing is written to Firestore in this stage.

```jsonc
{
  "people": [
    { "clickup": "sara.a",        "email": "sara@oursabeel.com",  "confidence": "exact-local-part" },
    { "clickup": "Omar (Design)", "email": null,                  "confidence": "no-match — FILL THIS IN" }
  ],
  "boards": [
    { "clickupList": "Marketing 2025", "boardName": "Marketing", "confidence": "renamed-by-you" }
  ],
  "columns": [
    { "clickupStatus": "to do",       "column": "To Do",        "confidence": "exact" },
    { "clickupStatus": "in review",   "column": null,           "confidence": "no-match — FILL THIS IN" }
  ]
}
```

Then we go through it together: I propose the fuzzy matches, you correct them.
Editing the file by hand is expected — it is the point of the stage.

Two rules the tool enforces:

- **A `null` target is a hard error at apply time.** Nothing is imported
  half-mapped.
- **Every ClickUp person must map to a real, existing `@oursabeel.com` account.**
  Assignment implies board membership in this app, so importing an assignee who
  has never signed in would produce cards assigned to nobody. People sign in
  once (landing `pending`) before the import runs.

---

## Stage 3 — Apply

```sh
# Dry run — the default. Writes nothing, prints exactly what it WOULD do.
GCLOUD_PROJECT=<project-id> node scripts/import-clickup.mjs

# Commit, once the dry-run output looks right.
GCLOUD_PROJECT=<project-id> node scripts/import-clickup.mjs --apply
```

Properties worth knowing:

- **Idempotent.** Every imported card carries a stable `sourceId` derived from
  its ClickUp id. Re-running updates rather than duplicates, so a partial or
  interrupted import can simply be run again.
- **Ordering is preserved** using the same fractional ranks the app uses.
- **Unmapped anything is a hard error**, listed and counted before it stops.
- Attachments are **out of scope** — this app deliberately has no file storage.
  If a card's description references one, the text survives; the file does not.

## After the import

1. Spot-check two or three boards against ClickUp side by side.
2. Check **My work** for a couple of people — that exercises assignment,
   membership and the collection-group index in one go.
3. Only then approve everyone's accounts and share the link.

Keep the ClickUp workspace read-only for a week or two rather than deleting it.
An import you can re-run against an intact source is a recoverable mistake; one
you cannot is not.
