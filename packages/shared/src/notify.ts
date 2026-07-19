import type { NotifyEvent } from './types';

/**
 * Who gets told what, and when they have opted out.
 *
 * Notification volume is the fastest way for this app to become as annoying as
 * the thing it replaced, so the default set is deliberately small and the one
 * high-frequency event ships OFF.
 */

export interface NotifyEventSpec {
  event: NotifyEvent;
  label: string;
  description: string;
  defaultOn: boolean;
}

export const NOTIFY_EVENTS: NotifyEventSpec[] = [
  {
    event: 'mention',
    label: 'You are @mentioned',
    description: 'Someone pulls you into a card by name.',
    defaultOn: true,
  },
  {
    event: 'assigned',
    label: 'A card is assigned to you',
    description: 'Work becomes yours.',
    defaultOn: true,
  },
  {
    event: 'commentOnMyCard',
    label: 'A comment on a card assigned to you',
    description: 'Discussion on work you own.',
    defaultOn: true,
  },
  {
    event: 'dueSoon',
    label: 'A card assigned to you is due soon',
    description: 'A morning reminder before the due date.',
    defaultOn: true,
  },
  {
    event: 'myCardMoved',
    label: 'A card assigned to you was moved',
    description:
      'Off by default: on an active board this fires constantly, and it is how notification fatigue starts.',
    defaultOn: false,
  },
  {
    event: 'newUserPending',
    label: 'Someone is waiting for approval',
    description: 'Admins only.',
    defaultOn: true,
  },
];

export const DEFAULT_NOTIFY_PREFS: Record<string, boolean> = Object.fromEntries(
  NOTIFY_EVENTS.map((e) => [e.event, e.defaultOn]),
);

/**
 * Should this person be told?
 *
 * Three independent reasons not to notify, in the order they are cheapest to
 * check. The self-check is first and is absolute: nobody wants to be told about
 * something they just did, and a system that does it looks broken.
 */
export function shouldNotify(params: {
  event: NotifyEvent;
  recipientUid: string;
  actorUid: string;
  boardId?: string;
  prefs?: Partial<Record<NotifyEvent, boolean>>;
  mutedBoardIds?: readonly string[];
  /** Only `active` accounts are notified — no point paging a disabled user. */
  status?: string;
}): boolean {
  if (params.recipientUid === params.actorUid) return false;
  if (params.status !== undefined && params.status !== 'active') return false;
  if (params.boardId && (params.mutedBoardIds ?? []).includes(params.boardId)) {
    return false;
  }

  const pref = params.prefs?.[params.event];
  // An absent preference means "never chosen", so fall back to the default
  // rather than treating undefined as off — otherwise nobody is ever notified
  // until they visit the settings screen.
  return pref === undefined ? (DEFAULT_NOTIFY_PREFS[params.event] ?? false) : pref;
}

/** The line shown in the inbox and on the push. Kept short — it is a lock screen. */
export function notificationText(params: {
  event: NotifyEvent;
  actorName: string;
  cardTitle?: string;
}): string {
  const card = params.cardTitle ? `“${params.cardTitle}”` : 'a card';
  switch (params.event) {
    case 'mention':
      return `${params.actorName} mentioned you on ${card}`;
    case 'assigned':
      return `${params.actorName} assigned you ${card}`;
    case 'commentOnMyCard':
      return `${params.actorName} commented on ${card}`;
    case 'dueSoon':
      return `${card} is due soon`;
    case 'myCardMoved':
      return `${params.actorName} moved ${card}`;
    case 'newUserPending':
      return `${params.actorName} is waiting for approval`;
  }
}
