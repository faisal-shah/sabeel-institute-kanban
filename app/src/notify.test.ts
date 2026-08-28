import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The NATIVE half of the push seam.
 *
 * It had no tests at all, which is how two real defects survived a full review:
 * `enablePush` ignored what `registerPush` returned, so a device that granted
 * permission but filed no token was reported as enabled; and `pushPromptState`
 * answered 'unsupported' whenever the app pointed at the emulators, which hid
 * the whole control from every local run. Both are asserted below.
 */
vi.mock('expo-notifications', () => ({
  setNotificationHandler: vi.fn(),
  setNotificationChannelAsync: vi.fn(() => Promise.resolve()),
  deleteNotificationChannelAsync: vi.fn(() => Promise.resolve()),
  requestPermissionsAsync: vi.fn(),
  getPermissionsAsync: vi.fn(),
  getDevicePushTokenAsync: vi.fn(),
  addPushTokenListener: vi.fn(() => ({ remove: vi.fn() })),
  AndroidImportance: { HIGH: 4, DEFAULT: 3 },
}));
vi.mock('react-native', () => ({ Linking: { openSettings: vi.fn(() => Promise.resolve()) } }));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(() => ({})),
  setDoc: vi.fn(() => Promise.resolve()),
  deleteDoc: vi.fn(() => Promise.resolve()),
}));
vi.mock('./firebase', () => ({ db: {} }));
vi.mock('./env', () => ({ USE_EMULATORS: false }));
vi.mock('./sentry', () => ({ captureError: vi.fn() }));

import * as Notifications from 'expo-notifications';
import { setDoc } from 'firebase/firestore';
import { enablePush, pushPromptState, registerPush } from './notify';

const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

function device(opts: { granted: boolean; canAskAgain?: boolean; token?: string | null }) {
  const perm = { granted: opts.granted, canAskAgain: opts.canAskAgain ?? true };
  asMock(Notifications.getPermissionsAsync).mockResolvedValue(perm);
  asMock(Notifications.requestPermissionsAsync).mockResolvedValue(perm);
  asMock(Notifications.getDevicePushTokenAsync).mockResolvedValue({
    data: opts.token === undefined ? 'fcm-native-token' : opts.token,
  });
}

beforeEach(() => vi.clearAllMocks());

describe('registerPush', () => {
  it('reports the token landing, not merely the permission', async () => {
    device({ granted: true });
    await expect(registerPush('user-1')).resolves.toBe(true);
    expect(setDoc).toHaveBeenCalledTimes(1);
  });

  it('reports false when the device yields no token', async () => {
    device({ granted: true, token: null });
    await expect(registerPush('user-1')).resolves.toBe(false);
    expect(setDoc).not.toHaveBeenCalled();
  });

  it('reports false when permission is refused', async () => {
    device({ granted: false });
    await expect(registerPush('user-1')).resolves.toBe(false);
    expect(setDoc).not.toHaveBeenCalled();
  });
});

describe('enablePush', () => {
  /**
   * The defect this is here for: it used to discard registerPush's result and
   * answer from the permission alone, so a granted device with no token behind
   * it was reported as 'granted' — a switch with nothing behind it.
   */
  it('is granted only when a token actually landed', async () => {
    device({ granted: true });
    await expect(enablePush('user-1')).resolves.toBe('granted');
  });

  it('is unavailable when permission was granted but no token landed', async () => {
    device({ granted: true, token: null });
    await expect(enablePush('user-1')).resolves.toBe('unavailable');
  });

  it('is denied when the dialog was refused for good', async () => {
    device({ granted: false, canAskAgain: false });
    await expect(enablePush('user-1')).resolves.toBe('denied');
  });

  it('is denied — still askable — when the dialog was merely dismissed', async () => {
    device({ granted: false, canAskAgain: true });
    await expect(enablePush('user-1')).resolves.toBe('denied');
  });
});

/**
 * The emulator flag gates REGISTRATION, never the UI state — the same split the
 * web sibling makes. Folding it into pushPromptState made the notifications
 * screen read 'unsupported' in every emulator-backed run, hiding the control.
 */
describe('against the emulators', () => {
  async function loadWithEmulators() {
    vi.resetModules();
    vi.doMock('./env', () => ({ USE_EMULATORS: true }));
    const mod = await import('./notify');
    vi.doUnmock('./env');
    return mod;
  }

  it('still reports what the DEVICE will permit', async () => {
    device({ granted: false, canAskAgain: true });
    const { pushPromptState: state } = await loadWithEmulators();
    await expect(state()).resolves.toBe('default');
  });

  it('files no token there is no emulator to deliver to', async () => {
    device({ granted: true });
    const { registerPush: reg } = await loadWithEmulators();
    await expect(reg('user-1')).resolves.toBe(false);
    expect(setDoc).not.toHaveBeenCalled();
  });

  /**
   * The gate sits BELOW the channel setup, and this is what says so.
   *
   * With it on the first line of registerPush — where it was — an
   * emulator-backed build could never create the channel or raise the system
   * dialog even once. That is the only build this project can put on a device,
   * so the one native surface a browser cannot reach was unreachable from the
   * only place it could be looked at, and `PUSH_CHANNEL_ID`'s importance was
   * unverifiable with it.
   *
   * It is checked on the device now: `dumpsys notification` shows exactly one
   * channel for the package, `sabeel-alerts` at `mImportance=4`.
   */
  it('still sets the channel up, and asks, before stopping at the token', async () => {
    device({ granted: true });
    const { enablePush: enable } = await loadWithEmulators();
    await enable('user-1');
    expect(Notifications.requestPermissionsAsync).toHaveBeenCalled();
    expect(Notifications.setNotificationChannelAsync).toHaveBeenCalled();
  });

  /**
   * A device that has NEVER BEEN ASKED, whose owner then says yes.
   *
   * The two permission mocks have to disagree for this to mean anything, which
   * is the whole point: `getPermissionsAsync` reports 'default' because nothing
   * has been asked yet, and `requestPermissionsAsync` grants because the person
   * taps Allow. Seeding both 'granted' — as the `device()` helper does — makes
   * this pass with the gate in either place, and the first draft of this test
   * did exactly that and proved nothing.
   *
   * With the gate at the top of registerPush the dialog never ran, so the state
   * stayed 'default' and `enablePush` called it 'denied' — a refusal invented
   * for a device that had not been asked. The nudge hides on 'denied' and
   * reports a failure only on 'unavailable', so the card vanished on a press
   * that had done nothing at all.
   */
  it('says unavailable, not denied, when the ask was granted but no token could be filed', async () => {
    // A real device, not a frozen pair of values: it starts unasked, and the
    // grant CHANGES what getPermissionsAsync reports afterwards. `enablePush`
    // re-reads the state rather than trusting the request's own return, so a
    // mock stuck at 'default' forever answers 'denied' whichever place the gate
    // is in — which is how the first draft of this test proved nothing.
    const unasked = { granted: false, canAskAgain: true };
    const allowed = { granted: true, canAskAgain: true };
    asMock(Notifications.getPermissionsAsync).mockResolvedValue(unasked);
    asMock(Notifications.requestPermissionsAsync).mockImplementation(async () => {
      asMock(Notifications.getPermissionsAsync).mockResolvedValue(allowed);
      return allowed;
    });
    const { enablePush: enable } = await loadWithEmulators();
    await expect(enable('user-1')).resolves.toBe('unavailable');
  });
});

/**
 * WHICH function may raise the system dialog. The whole point of the batch, and
 * the half that was left undone on native.
 *
 * A browser enforces this by refusing a request that does not follow a click.
 * Android honours one from anywhere, so nothing but this suite holds it down —
 * and nothing did: signing in raised "Allow Kanban dev to send you
 * notifications?" over the *Waiting for approval* screen, before the account was
 * approved and before any board existed to be notified about. Android 13 spends
 * that prompt after a second refusal, so the worst moment to ask was also nearly
 * the last chance to.
 */
describe('only the button asks', () => {
  it('sign-in never raises the dialog, whatever the device would say', async () => {
    // Would grant if asked — so a passing result here cannot come from the
    // device refusing. The point is that nothing is asked at all.
    device({ granted: false, canAskAgain: true });
    asMock(Notifications.requestPermissionsAsync).mockResolvedValue({
      granted: true,
      canAskAgain: true,
    });

    await expect(registerPush('user-1')).resolves.toBe(false);
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(setDoc).not.toHaveBeenCalled();
  });

  it('sign-in still registers a device that was already permitted', async () => {
    device({ granted: true });
    await expect(registerPush('user-1')).resolves.toBe(true);
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(setDoc).toHaveBeenCalledTimes(1);
  });

  it('the button is what asks', async () => {
    device({ granted: false, canAskAgain: true });
    asMock(Notifications.requestPermissionsAsync).mockResolvedValue({
      granted: true,
      canAskAgain: true,
    });

    await expect(enablePush('user-1')).resolves.toBe('granted');
    expect(Notifications.requestPermissionsAsync).toHaveBeenCalledTimes(1);
  });
});

describe('pushPromptState', () => {
  it('reports a device that can still be asked', async () => {
    device({ granted: false, canAskAgain: true });
    await expect(pushPromptState()).resolves.toBe('default');
  });

  it('reports a spent prompt as denied', async () => {
    device({ granted: false, canAskAgain: false });
    await expect(pushPromptState()).resolves.toBe('denied');
  });

  it('reports granted', async () => {
    device({ granted: true });
    await expect(pushPromptState()).resolves.toBe('granted');
  });
});
