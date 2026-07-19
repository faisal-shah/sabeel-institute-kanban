/**
 * Cross-surface constants. Anything both the app and functions must agree on
 * lives here — never duplicated on either side.
 */

/**
 * The only domain permitted to sign in. `oursabeel.com` is a Google Workspace
 * domain, so the OAuth consent screen is set to "Internal" and Google itself
 * refuses outside accounts.
 *
 * This constant is still the authority for the SERVER-SIDE check: the client
 * `hd` hint is a convenience, never a security boundary, and the consent-screen
 * setting could be changed in a console without touching this repo.
 * See docs/PRODUCT_BRIEF.md, "Domain restriction is a server-side check".
 */
export const ALLOWED_EMAIL_DOMAIN = 'oursabeel.com';

/**
 * The single timezone concept in the app. Due dates are all-day `YYYY-MM-DD`
 * strings, so this only decides what "today" means for overdue highlighting and
 * due-soon reminders. Deliberately NOT the per-entry work-local timezone
 * machinery the sibling time-tracker needed.
 */
export const ORG_TIMEZONE = 'America/New_York';

/** Columns every new board starts with. All renameable and removable. */
export const DEFAULT_COLUMNS = ['To Do', 'In Progress', 'Done'] as const;

/** Recent boards kept on the user doc, so the list syncs between phone and web. */
export const MAX_RECENT_BOARDS = 10;
