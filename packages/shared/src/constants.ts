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

/**
 * Field-length caps. These MUST match the sizes hard-coded in `firestore.rules`
 * (rules cannot import TypeScript). The rules remain the enforcement; the client
 * uses these to cap inputs so a normal action never fails with a raw
 * `permission-denied`. `BOARD_NAME_MAX` lives in `boards.ts` next to
 * `validateBoardName`.
 */
export const CARD_TITLE_MAX = 200;
export const COMMENT_BODY_MAX = 5000;
/** Generous, but bounded — a card is re-downloaded on every board-list snapshot. */
export const CARD_DESCRIPTION_MAX = 20000;

/**
 * Every collection holding data worth noticing the loss of — the inventory the
 * `healthCheck` canary counts (functions/src/health.ts).
 *
 * `root` collections are counted with `db.collection(name)`; `group` ones live
 * under a parent (`cards/{id}/comments`, `users/{uid}/notifications`) and can only
 * be counted across the whole database with `db.collectionGroup(name)`. Getting
 * this wrong does not error — a `collection('comments')` query simply counts the
 * non-existent top-level path and returns 0 forever, which is a canary that
 * reports perfect health while seeing nothing.
 *
 * `pushTokens` is deliberately absent: device tokens rotate constantly, and every
 * device re-registers its token on next launch, so a drop is neither alarming nor
 * permanent — counting it would only add noise to the signal.
 */
export const COLLECTIONS = {
  users: 'root',
  boards: 'root',
  cards: 'root',
  comments: 'group',
  activity: 'group',
  notifications: 'group',
} as const;

export type CollectionName = keyof typeof COLLECTIONS;
