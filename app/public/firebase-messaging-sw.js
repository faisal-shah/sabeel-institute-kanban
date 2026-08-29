/*
 * Service worker for web push.
 *
 * A browser cannot be woken by a push without one: when the tab is closed or
 * backgrounded there is no page running, so the push service hands the message
 * to this worker instead. It must sit at the ORIGIN ROOT — a worker under a
 * subdirectory can only receive events for that subdirectory.
 *
 * It runs outside the app bundle, so it cannot import from src/ and duplicates
 * the Firebase config. Only the fields FCM needs are here; keep them in step
 * with app/src/firebase-config.ts. These are public client identifiers, the
 * same ones already committed there.
 *
 * The compat build is deliberate: importScripts has no module system, and the
 * modular SDK cannot be loaded this way.
 */
importScripts('https://www.gstatic.com/firebasejs/12.0.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.0.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyDnHBj4vlBquHotVRjexa2yB1_x18XWqaI',
  projectId: 'sabeel-institute-kanban',
  messagingSenderId: '826656438175',
  appId: '1:826656438175:web:d9d89ccb61181de5c5efaa',
});

const messaging = firebase.messaging();

// Background messages only, and that is FCM's choice rather than ours: its SW
// looks for a visible client window and, finding one, skips this handler and
// forwards to the page's `onMessage` instead.
//
// The app registers no `onMessage`, so a push arriving at a FOCUSED tab draws
// nothing — no banner, no sound. That is deliberate and not a gap: the
// notification is written to Firestore independently of the push, so the Alerts
// tab's unread badge goes up either way and the inbox has the item. Somebody
// looking at the app does not need a banner over it.
//
// It does mean a delivery TEST must background the tab or minimise the browser,
// or it looks like nothing arrived. Native differs — it shows a banner in the
// foreground too (setNotificationHandler in notify.ts) — because there the app
// being open does not imply the notification is on screen.
messaging.onBackgroundMessage((payload) => {
  const { title, body } = payload.notification ?? {};
  self.registration.showNotification(title ?? 'Sabeel Kanban', {
    body: body ?? '',
    icon: '/favicon.ico',
    // Collapse repeats for the same card rather than stacking a banner per
    // comment on a busy thread.
    tag: payload.data?.cardId ?? payload.data?.boardId ?? 'sabeel-kanban',
    data: payload.data ?? {},
  });
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
