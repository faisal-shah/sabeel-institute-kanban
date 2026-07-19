/**
 * Cross-surface constants. Anything both the app and functions must agree on
 * lives here — never duplicated on either side.
 */

/**
 * The only domain permitted to sign in.
 *
 * This constant is the authority for the SERVER-SIDE check, and as of 2026-07-19
 * it is the ONLY thing enforcing the domain: the OAuth consent screen is
 * External (Internal needs a Cloud organization, which the project does not
 * belong to). The client `hd` hint is a convenience, never a boundary.
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
