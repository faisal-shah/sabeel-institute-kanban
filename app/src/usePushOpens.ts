/**
 * Open the right screen when a push notification is tapped.
 *
 * Sibling of useDeepLinks and mounted beside it, for the same reason it exists:
 * this runs from the signed-in shell, so the access gate has already passed and
 * a notification tapped while signed out is honoured right after sign-in.
 *
 * Kept separate from useDeepLinks rather than folded in, because the two share
 * only their destination. A deep link is a URL that has to be parsed and whose
 * card must be resolved to a board; a push already carries `boardId` and
 * `cardId` in its payload, put there by the same function that wrote the inbox
 * entry. Merging them would be one hook with two unrelated parsers.
 *
 * Navigation goes through nav's module-level `push`, so the only dependency is
 * the signed-in uid — which the effect needs in order to mark the tapped entry
 * read, and which re-subscribing on is correct: a different account must not
 * mark notifications read on the previous one's inbox.
 */
import { useEffect } from 'react';
import { push } from './nav';
import { markReadById, routeForNotification } from './notifications';
import { subscribePushOpens, takeInitialPush, type PushData } from './pushOpen';

export function usePushOpens(uid: string): void {
  useEffect(() => {
    const open = (data: PushData) => {
      // Tapping the push IS reading it, so the badge comes down here exactly as
      // it does in Alerts. Best-effort: a failed write must not stop the
      // navigation, which is what the person actually asked for.
      if (data.notifId) void markReadById(uid, data.notifId).catch(() => undefined);

      const route = routeForNotification(data);
      // No route means the payload had nothing to navigate to. Opening the app
      // is still the right outcome — the notification is in Alerts either way —
      // so this deliberately does nothing rather than guessing at a screen.
      if (route) push(route);
    };

    // The launch notification, if the app was started by tapping one. Reading it
    // also clears it, so this cannot re-fire on a later sign-in.
    const initial = takeInitialPush();
    if (initial) open(initial);

    return subscribePushOpens(open);
  }, [uid]);
}
