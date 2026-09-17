/*
 * Service worker for web push.
 *
 * A browser cannot be woken by a push without one: when the tab is closed or
 * backgrounded there is no page running, so the push service hands the message
 * to this worker instead. It must sit at the ORIGIN ROOT — a worker under a
 * subdirectory can only receive events for that subdirectory.
 *
 * It handles the `push` event ITSELF, without the Firebase messaging SDK, and
 * that is the decision this file turns on. The SDK's worker shows a push only
 * while no tab of the app is visible; one arriving at a focused tab is handed
 * to the page instead and drawn only if the page registers `onMessage`, which
 * this app never did — so a push at an open tab drew nothing, and this file
 * used to call that deliberate. Faisal's decision (2026-09-17) is the reverse:
 * a notification shows whether the app is in the foreground, the background or
 * closed, on both surfaces. On web that means the worker shows every push, so
 * the visibility split is exactly the behaviour to remove — and the SDK had a
 * second problem: with a `notification` payload it showed the push ITSELF
 * before calling `onBackgroundMessage`, so the handler that used to live here
 * drew a second banner beside the SDK's own, which nothing could dismiss into
 * the app because the SDK's click handler stops propagation and, with no link
 * configured, does nothing. Two banners per background push, never seen,
 * because web arrival has never been watched (TODO.md § I).
 *
 * One listener, one presenter, and no copy of the Firebase config: minting the
 * token (`notify.web.ts`) needs only a registration, not a Firebase-aware
 * worker. The payload is FCM's web push JSON — `notification` (title, body)
 * and `data` — the same two fields the SDK's handler used to pass on.
 * `firebase-messaging-sw.test.ts` runs this file in a fake worker scope and
 * holds both handlers to what they do here.
 */

const APP_NAME = 'Sabeel Kanban';

// Take over as soon as a new version of this file is installed. A worker waits
// by default until every tab of the app is closed, which for someone who keeps
// a tab open means weeks on the previous worker; this one intercepts no
// fetches, so there is nothing an open page could be part-way through with the
// old one, and a push arriving after the deploy should be drawn by the code
// that was deployed.
self.addEventListener('install', () => self.skipWaiting());

/** FCM's JSON body, or null for a push that is not one (nothing else sends any). */
function readPayload(event) {
  try {
    return event.data ? event.data.json() : null;
  } catch {
    return null;
  }
}

self.addEventListener('push', (event) => {
  const payload = readPayload(event);
  if (!payload) return;
  const { title, body } = payload.notification ?? {};
  const data = payload.data ?? {};
  event.waitUntil(
    self.registration.showNotification(title ?? APP_NAME, {
      body: body ?? '',
      icon: '/favicon.ico',
      // Collapse repeats for the same card rather than stacking a banner per
      // comment on a busy thread.
      tag: data.cardId ?? data.boardId ?? 'sabeel-kanban',
      data,
    }),
  );
});

// Clicking a notification focuses the app. It does NOT deep-link to the card:
// the web app has no URL handling for board/card ids yet, so a link like
// /?board=…&card=… would look meaningful and land on the home screen anyway.
// Writing one now would be a silent no-op. If deep links are added later, the
// ids are already in event.notification.data and this is the place to use them.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      const open = wins.find((w) => w.url.startsWith(self.location.origin));
      return open ? open.focus() : clients.openWindow('/');
    }),
  );
});
