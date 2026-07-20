import { getMessaging, getToken, isSupported } from 'firebase/messaging';
import { deleteDoc, doc, setDoc } from 'firebase/firestore';
import { app, db } from './firebase';
import { USE_EMULATORS } from './env';
import { captureError } from './sentry';

/**
 * Push registration — WEB (native sibling: notify.ts).
 *
 * Web push needs two things that native does not, and quietly does nothing
 * without either:
 *
 *  - the Web Push certificate (VAPID) public key in EXPO_PUBLIC_FCM_VAPID_KEY;
 *  - a service worker at /firebase-messaging-sw.js, since a browser cannot be
 *    woken by a message without one.
 *
 * Both are inert-by-default on purpose: a half-configured web push should do
 * nothing rather than throw at someone signing in. See TODO.md § I.
 */
const VAPID_KEY = process.env.EXPO_PUBLIC_FCM_VAPID_KEY ?? '';

export async function registerPush(uid: string): Promise<void> {
  if (USE_EMULATORS || !VAPID_KEY) return;
  try {
    if (!(await isSupported())) return;
    if ((await Notification.requestPermission()) !== 'granted') return;
    const sw = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
    const token = await getToken(getMessaging(app), {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: sw,
    });
    if (!token) return;
    await setDoc(doc(db, 'users', uid, 'pushTokens', token), {
      platform: 'web',
      updatedAt: Date.now(),
    });
  } catch (e) {
    captureError(e, { source: 'registerPush' });
  }
}

/**
 * Called on sign-out. Pushes target the BROWSER, not the session, so a shared
 * computer would otherwise keep showing the previous account's notifications.
 *
 * `getToken` here never prompts: if permission was already granted it returns
 * the existing token, and otherwise this is a no-op.
 */
export async function unregisterPush(uid: string): Promise<void> {
  if (USE_EMULATORS || !VAPID_KEY) return;
  try {
    if (!(await isSupported()) || Notification.permission !== 'granted') return;
    const sw = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
    const token = await getToken(getMessaging(app), {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: sw,
    });
    if (!token) return;
    await deleteDoc(doc(db, 'users', uid, 'pushTokens', token));
  } catch {
    // Nothing registered, nothing to remove.
  }
}
