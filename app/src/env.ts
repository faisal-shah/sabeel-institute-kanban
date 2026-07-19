import { Platform } from 'react-native';

/**
 * Build-time switches. All read from EXPO_PUBLIC_* so they are inlined at bundle
 * time — which is also why `web:export` always passes --clear: Metro will
 * otherwise happily serve a cached bundle built with different values, and an
 * emulator-mode bundle must never reach Hosting.
 */
export const USE_EMULATORS = process.env.EXPO_PUBLIC_USE_EMULATORS === '1';

/**
 * The Android emulator reaches the host machine at 10.0.2.2, never localhost —
 * localhost inside the emulator is the emulated device itself.
 */
export const EMULATOR_HOST = Platform.OS === 'android' ? '10.0.2.2' : '127.0.0.1';

export const EMULATOR_PORTS = {
  auth: 9099,
  firestore: 8080,
  functions: 5001,
} as const;

/** Dev-only affordances (the emulator sign-in row) must never ship. */
export const IS_DEV = __DEV__;
