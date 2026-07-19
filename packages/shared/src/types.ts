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
  pushTokens: string[];
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
  labels: BoardLabel[];
  /** Drives `array-contains` queries for "my boards". */
  memberUids: string[];
  createdAt: number;
  createdBy: string;
}

// ---- Cards -----------------------------------------------------------------

export type Priority = 'none' | 'low' | 'medium' | 'high' | 'urgent';

export interface CardDoc {
  title: string;
  /** Markdown source. Never HTML — see PRODUCT_BRIEF § "Why markdown". */
  description: string;
  columnId: string;
  /** Fractional base-62 rank. Only `rankBetween` in this package produces these. */
  rank: string;
  /**
   * MUST be a subset of the parent board's `memberUids` — rules enforce it.
   * This is what makes the cross-board "My Work" collection-group query legal
   * without a per-card parent lookup. Breaking it breaks My Work's security.
   */
  assigneeUids: string[];
  /** All-day date as `YYYY-MM-DD`. Never a timestamp — timestamps drift. */
  dueDate?: string;
  priority: Priority;
  labelIds: string[];
  archived: boolean;
  archivedAt?: number;
  commentCount: number;
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
