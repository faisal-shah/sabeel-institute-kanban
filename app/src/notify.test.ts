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
