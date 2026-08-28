import { Linking } from 'react-native';
import * as Notifications from 'expo-notifications';
import { deleteDoc, doc, setDoc } from 'firebase/firestore';
import { PUSH_CHANNEL_ID, PUSH_CHANNEL_NAME } from '@sabeel/shared';
import { db } from './firebase';
import { USE_EMULATORS } from './env';
import { captureError } from './sentry';

/** Watches for FCM rotating the device token. One at a time, per signed-in uid. */
let tokenListener: { remove: () => void } | null = null;

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

/**
 * Native can deep-link to its own settings page, so a blocked device gets a
 * button rather than instructions. The web sibling cannot — see there.
 */
export const canOpenPushSettings = true;

export function openPushSettings(): void {
  void Linking.openSettings();
}

/** Mirrors the web sibling — see notify.web.ts for why this is not a boolean. */
export type PushEnableResult = 'granted' | 'denied' | 'unavailable';

/**
 * What the notifications screen should offer. Mirrors the web sibling;
 * `canAskAgain` is Android's way of saying the prompt has been spent, which is
 * the same dead end as a browser 'denied'.
 */
export async function pushPromptState(): Promise<
  'granted' | 'denied' | 'default' | 'unsupported'
> {
  if (USE_EMULATORS) return 'unsupported';
  try {
    const perm = await Notifications.getPermissionsAsync();
    if (perm.granted) return 'granted';
    return perm.canAskAgain ? 'default' : 'denied';
  } catch {
    return 'unsupported';
  }
}

/**
 * Ask for permission and register — the screen's "turn these on" button.
 *
 * The web sibling has to be called straight from a click and may not await
 * first; Android has no such rule, so this is just `registerPush`, which
 * already prompts here. Sign-in still prompts on Android for the same reason —
 * it works — so this button is normally only reached by someone who declined
 * earlier.
 */
export async function enablePush(uid: string): Promise<PushEnableResult> {
  await registerPush(uid);
  const state = await pushPromptState();
  if (state === 'granted') return 'granted';
  // 'default' here means the system dialog was dismissed rather than refused —
  // still askable, so the screen re-reads the state and keeps offering.
  return state === 'unsupported' ? 'unavailable' : 'denied';
}

export async function registerPush(uid: string): Promise<boolean> {
  // FCM has no emulator. Registering against the emulator project would file a
  // token nothing can deliver to, and make local runs non-deterministic.
  if (USE_EMULATORS) return false;
  try {
    // The channel the server addresses by id — see PUSH_CHANNEL_ID for why the
    // two must agree and why the importance has to be right the first time.
    await Notifications.setNotificationChannelAsync(PUSH_CHANNEL_ID, {
      name: PUSH_CHANNEL_NAME,
      importance: Notifications.AndroidImportance.HIGH,
    });
    // The old channel, which nothing ever posted to because the server sent no
    // channel id at all. Left alone it sits in Android's notification settings
    // as a second, permanently silent "Default" that people would reasonably
    // try to configure.
    await Notifications.deleteNotificationChannelAsync('default').catch(() => {});
    const perm = await Notifications.requestPermissionsAsync();
    if (!perm.granted) return false;

    // getDevicePushTokenAsync gives the native FCM token, which is what the
    // Admin SDK sends to. getExpoPushTokenAsync would return an Expo token and
    // route through Expo's service instead — a different delivery path that the
    // functions do not use.
    const { data: token } = await Notifications.getDevicePushTokenAsync();
    if (typeof token !== 'string' || !token) return false;

    await storeToken(uid, token);

    // FCM rotates a token on its own schedule — a restore to a new device, an
    // app-data clear, a long enough gap. When it does, the stored one is dead:
    // the server prunes it on the next send and that person silently stops
    // getting notifications until they happen to sign out and back in. Nothing
    // else would ever tell us, because registration only runs at sign-in.
    if (!tokenListener) {
      tokenListener = Notifications.addPushTokenListener((next) => {
        if (typeof next.data === 'string' && next.data) {
          void storeToken(uid, next.data).catch(() => undefined);
        }
      });
    }
    return true;
  } catch (e) {
    captureError(e, { source: 'registerPush' });
    return false;
  }
}

async function storeToken(uid: string, token: string): Promise<void> {
  await setDoc(doc(db, 'users', uid, 'pushTokens', token), {
    platform: 'android',
    updatedAt: Date.now(),
  });
}

/**
 * Called on sign-out. Pushes target the DEVICE, not the session, so without
 * this a shared or handed-on phone keeps receiving the previous account's
 * notifications — which is a disclosure, not just an annoyance.
 */
export async function unregisterPush(uid: string): Promise<void> {
  if (USE_EMULATORS) return;
  // Stop watching for rotations first: the listener closes over the uid that is
  // signing out, so a rotation arriving mid-sign-out would file the new token
  // straight back under the account we are in the middle of detaching.
  tokenListener?.remove();
  tokenListener = null;
  try {
    const { data: token } = await Notifications.getDevicePushTokenAsync();
    if (typeof token !== 'string' || !token) return;
    await deleteDoc(doc(db, 'users', uid, 'pushTokens', token));
  } catch {
    // No permission or no token: nothing was registered, so nothing to remove.
  }
}
