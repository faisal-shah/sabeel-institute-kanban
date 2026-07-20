import * as Notifications from 'expo-notifications';
import { deleteDoc, doc, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import { USE_EMULATORS } from './env';
import { captureError } from './sentry';

/**
 * Push registration — NATIVE (web sibling: notify.web.ts).
 *
 * Asks permission, takes the device's FCM token, and files it under
 * `users/{uid}/pushTokens/{token}` so the notification functions can reach this
 * device. Until this existed the server sent to an empty token list every time:
 * the whole push path was built and unreachable.
 *
 * A document per token, not an array on the user doc — two devices registering
 * at once cannot collide, and firestore.rules can scope write access to a
 * person's own tokens without opening the rest of their user document.
 *
 * Never throws. Notifications are best-effort, and failing to register one is
 * not a reason to interrupt somebody signing in.
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export async function registerPush(uid: string): Promise<void> {
  // FCM has no emulator. Registering against the emulator project would file a
  // token nothing can deliver to, and make local runs non-deterministic.
  if (USE_EMULATORS) return;
  try {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Default',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
    const perm = await Notifications.requestPermissionsAsync();
    if (!perm.granted) return;

    // getDevicePushTokenAsync gives the native FCM token, which is what the
    // Admin SDK sends to. getExpoPushTokenAsync would return an Expo token and
    // route through Expo's service instead — a different delivery path that the
    // functions do not use.
    const { data: token } = await Notifications.getDevicePushTokenAsync();
    if (typeof token !== 'string' || !token) return;

    await setDoc(doc(db, 'users', uid, 'pushTokens', token), {
      platform: 'android',
      updatedAt: Date.now(),
    });
  } catch (e) {
    captureError(e, { source: 'registerPush' });
  }
}

/**
 * Called on sign-out. Pushes target the DEVICE, not the session, so without
 * this a shared or handed-on phone keeps receiving the previous account's
 * notifications — which is a disclosure, not just an annoyance.
 */
export async function unregisterPush(uid: string): Promise<void> {
  if (USE_EMULATORS) return;
  try {
    const { data: token } = await Notifications.getDevicePushTokenAsync();
    if (typeof token !== 'string' || !token) return;
    await deleteDoc(doc(db, 'users', uid, 'pushTokens', token));
  } catch {
    // No permission or no token: nothing was registered, so nothing to remove.
  }
}
