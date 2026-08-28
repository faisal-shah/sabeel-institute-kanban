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
  // openSettings REJECTS when the platform cannot honour it, and a bare `void`
  // would leave that unhandled. There is nothing useful to do about it: the
  // screen has already said where the setting lives.
  void Linking.openSettings().catch(() => undefined);
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
  // Deliberately says nothing about USE_EMULATORS — the web sibling explains
  // why. What the DEVICE will permit does not depend on which Firebase backend
  // it is pointed at, and reporting 'unsupported' locally hid the whole control
  // from every emulator-backed run. Registration is what the emulator gates.
  try {
    const perm = await Notifications.getPermissionsAsync();
    if (perm.granted) return 'granted';
    return perm.canAskAgain ? 'default' : 'denied';
  } catch {
    return 'unsupported';
  }
}

/**
 * Ask for permission and register — the ONLY function that may prompt.
 *
 * The same rule as the web sibling, for a different reason. A browser refuses a
 * request that does not follow a click; Android honours one from anywhere, and
 * that is exactly the trap. Asking from the sign-in path put the system dialog
 * on the **Waiting for approval** screen — before the account is approved,
 * before a single board is visible, with nothing yet to be notified about. Seen
 * on the device; see the note on `registerPush`.
 *
 * The RETURN, not just the permission afterwards. Permission granted with no
 * token filed — an emulator run, a device that refused the token — is not a
 * success, and reporting it as one puts "enabled" over a device that will
 * receive nothing. Same three outcomes as the web sibling.
 */
export async function enablePush(uid: string): Promise<PushEnableResult> {
  try {
    const perm = await Notifications.requestPermissionsAsync();
    // Covers a spent prompt too: Android answers a `canAskAgain: false` request
    // immediately, showing nothing, so this is 'denied' without a dialog and the
    // screen goes on to offer **Open settings**.
    if (!perm.granted) return 'denied';
    return (await claimToken(uid)) ? 'granted' : 'unavailable';
  } catch (e) {
    captureError(e, { source: 'enablePush' });
    return 'unavailable';
  }
}

/**
 * Register this device for push if it is ALREADY permitted. Never prompts.
 *
 * This is the sign-in path, and it is silent for the same reason the web
 * sibling's is — arrived at from a Firestore snapshot callback, nowhere near a
 * decision the person was making.
 *
 * On web the browser enforces that. Android does not, and prompting anyway is
 * what the device pass caught: signing in raised **"Allow Kanban dev to send
 * you notifications?"** on top of the *Waiting for approval* screen, where the
 * account is not yet approved and no board can be seen. Android 13 spends that
 * prompt — a second refusal fixes it permanently — so the worst possible moment
 * to ask is also very nearly the last chance to. Someone who declines there is
 * left with the nudge card's one remaining ask, and after that only Settings.
 *
 * Asking belongs to `enablePush`, reached from a press: the nudge on the Boards
 * screen, or the notifications screen itself. A device permitted on an earlier
 * run still registers silently right here, so nothing that already works stops.
 */
export async function registerPush(uid: string): Promise<boolean> {
  try {
    const perm = await Notifications.getPermissionsAsync();
    if (!perm.granted) return false;
    return await claimToken(uid);
  } catch (e) {
    captureError(e, { source: 'registerPush' });
    return false;
  }
}

/**
 * Take the FCM token for this device and file it under the user.
 *
 * Callers have already established permission; this half may await freely. The
 * web sibling's function of the same name does the same job.
 */
async function claimToken(uid: string): Promise<boolean> {
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

  // FCM has no emulator. A token minted here could never be delivered to and
  // would make local runs non-deterministic — so registration stops at the
  // token, exactly where the web sibling stops it.
  //
  // BELOW the channel setup, not above the whole function, and that placement
  // is the point: with the gate on the first line of `registerPush` a local
  // build could never once raise the Android dialog or create the channel, so
  // the one native surface a browser cannot reach was unreachable from the only
  // build this project can put on a device. Everything above this line is real
  // on a local run now; only the token is withheld.
  if (USE_EMULATORS) return false;

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
