/**
 * Shared document shapes. These mirror docs/PRODUCT_BRIEF.md § Data model —
 * change them together.
 */

// ---- Users -----------------------------------------------------------------

/**
 * Org-wide role. There are deliberately NO per-board roles: board access is
 * membership (`Board.memberUids`), and what you may DO is decided by this.
 */
export type Role = 'member' | 'manager' | 'admin';

/** Every account lands `pending`; only an admin moves it on. */
export type UserStatus = 'pending' | 'active' | 'rejected' | 'disabled';

export type NotifyEvent =
  | 'mention'
  | 'assigned'
  | 'commentOnMyCard'
  | 'dueSoon'
  | 'myCardMoved'
  | 'newUserPending';

export interface UserDoc {
  displayName: string;
  email: string;
  photoUrl?: string;
  /** Mirrors the custom claim for UI display. Rules trust the TOKEN, not this. */
  status: UserStatus;
  /** Mirrors the custom claim for UI display. Rules trust the TOKEN, not this. */
  role: Role;
  notifyPrefs: Partial<Record<NotifyEvent, boolean>>;
  mutedBoardIds: string[];
  favoriteBoardIds: string[];
  recentBoardIds: string[];
  unreadNotifCount: number;
  createdAt: number;
}

// ---- Boards ----------------------------------------------------------------

export interface BoardColumn {
  id: string;
  name: string;
}

export interface BoardLabel {
  id: string;
  name: string;
  /** Must stay legible on both light and dark backgrounds. */
  color: string;
}

export interface BoardDoc {
  name: string;
  description: string;
  archived: boolean;
  columns: BoardColumn[];
  /**
   * The ids from `columns`, duplicated as a flat array.
   *
   * Firestore rules cannot search a list of maps, so this is what lets a card
   * write be checked against "is this a real column on this board?" in one
   * cheap expression. Always written together with `columns`.
   */
  columnIds: string[];
  labels: BoardLabel[];
  /** Drives `array-contains` queries for "my boards". */
  memberUids: string[];
  /**
   * Names and addresses of the board's members, denormalised.
   *
   * Only admins may list `users/*`, but every board member needs to see who is
   * on the board to assign a card or @mention someone. Without this a member
   * would hit permission-denied on the directory and simply be unable to assign
   * anyone. Written together with `memberUids`; the removeBoardMember callable
   * clears both.
   */
  memberProfiles: Record<string, { displayName: string; email: string }>;
  /**
   * Number of non-archived cards on this board, denormalised so the Boards list
   * can show it without counting cards per board per render. Server-maintained
   * by the `onCardBoardCount` trigger — never written by a client (same trust
   * model as a card's `commentCount`).
   */
  activeCardCount: number;
  createdAt: number;
  createdBy: string;
}

// ---- Cards -----------------------------------------------------------------

export type Priority = 'none' | 'low' | 'medium' | 'high' | 'urgent';

export interface CardDoc {
  /**
   * The board this card is on. Cards are a TOP-LEVEL collection (`cards/{id}`),
   * not a subcollection, so the board is a field, not the path. Client-supplied
   * and rule-validated: create/update require membership of this board, and a
   * cross-board MOVE is precisely a mutation of this field (to another board the
   * user is a member of). See firestore.rules `match /cards/{cardId}`.
   */
  boardId: string;
  title: string;
  /** Plain text. Never markdown/HTML — see PRODUCT_BRIEF § "Why plain text". */
  description: string;
  columnId: string;
  /** Fractional base-62 rank. Only `rankBetween` in this package produces these. */
  rank: string;
  /**
   * MUST be a subset of `boardId`'s `memberUids` — rules enforce it. This is what
   * lets an assignee read a card (the "My Work" query) via the read rule's
   * assignee arm without a parent-board lookup. Breaking it breaks My Work's
   * security. A move drops any assignee who isn't a member of the destination.
   */
  assigneeUids: string[];
  /** All-day date as `YYYY-MM-DD`. Never a timestamp — timestamps drift. */
  dueDate?: string;
  priority: Priority;
  labelIds: string[];
  archived: boolean;
  archivedAt?: number;
  commentCount: number;
  /**
   * The card this one is a subtask OF. The link lives on the CHILD so there is a
   * single source of truth: a `subtaskIds` array on the parent could disagree
   * with reality, and every reparent would be a two-document write.
   *
   * BOARD-SCOPED by convention, not by rule. Enforcing "the parent is on the same
   * board" would need the first card → card `get()` in firestore.rules — a read
   * per write plus a delete/write race — and it is not a security boundary, since
   * this is an opaque string and a child's read access comes from its own
   * `boardId`. So the picker only ever offers same-board cards, and a link that
   * goes stale (parent moved or deleted) simply renders as nothing. A cross-board
   * move clears it, the same way it clears `labelIds`.
   */
  parentId?: string;
  createdAt: number;
  createdBy: string;
  updatedAt: number;
  updatedBy: string;
  /** Stable id from a ClickUp import, making re-runs idempotent. */
  sourceId?: string;
}

// ---- Comments & activity ---------------------------------------------------

export interface CommentDoc {
  authorUid: string;
  body: string;
  mentionUids: string[];
  createdAt: number;
  editedAt?: number;
}

export type ActivityType =
  | 'created'
  | 'moved'
  | 'assigned'
  | 'unassigned'
  | 'due'
  | 'priority'
  | 'labels'
  | 'edited'
  | 'archived';

/** Trigger-written only. Clients have no write access at all. */
export interface ActivityDoc {
  type: ActivityType;
  actorUid: string;
  at: number;
  from?: string;
  to?: string;
}

/** Trigger-written. The client may only flip `read`. */
export interface NotificationDoc {
  type: NotifyEvent;
  boardId: string;
  cardId?: string;
  actorUid: string;
  text: string;
  read: boolean;
  at: number;
}
