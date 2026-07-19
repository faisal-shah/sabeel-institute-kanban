/**
 * Firebase singletons — NATIVE (Android). The web variant is firebase.web.ts.
 *
 * Two platform differences drive the split:
 *
 *  1. Auth persistence. Without an explicit AsyncStorage persistence the user is
 *     signed out every time the app restarts. `getReactNativePersistence` exists
 *     in the SDK's react-native build (Metro resolves it via the package's
 *     "react-native" field) but is absent from the web typings shipped as the
 *     default types — hence the local type shim below.
 *
 *  2. Firestore cache. `persistentLocalCache` needs IndexedDB, which React
 *     Native does not have, so native gets the memory cache. Offline therefore
 *     means "works while the app stays open", not "survives a restart". See
 *     docs/PRODUCT_BRIEF.md § Offline.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import * as firebaseAuth from 'firebase/auth';
import {
  connectAuthEmulator,
  initializeAuth,
  type Auth,
  type Persistence,
} from 'firebase/auth';
import {
  connectFirestoreEmulator,
  initializeFirestore,
  memoryLocalCache,
  type Firestore,
} from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions, type Functions } from 'firebase/functions';
import { firebaseConfig } from './firebase-config';
import { EMULATOR_HOST, EMULATOR_PORTS, USE_EMULATORS } from './env';

// Present at runtime in the SDK's react-native build (Metro picks it via the
// package's "react-native" field) but absent from the web typings that ship as
// the default types — so the cast is the only way to reach it with types on.
const { getReactNativePersistence } = firebaseAuth as unknown as {
  getReactNativePersistence: (storage: unknown) => Persistence;
};

export const app: FirebaseApp = getApps().length
  ? getApps()[0]
  : initializeApp(firebaseConfig);

export const auth: Auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage),
});

export const db: Firestore = initializeFirestore(app, {
  localCache: memoryLocalCache(),
  // React Native's networking stack does not support Firestore's default
  // WebChannel streaming transport. Without long polling the FIRST snapshot
  // arrives and then the listen stream silently dies — so a document created a
  // moment later never reaches the client, with no error anywhere.
  //
  // Observed exactly that on 2026-07-19: the account was provisioned server-side
  // and the app sat on "Setting up your account…" forever, because the only
  // snapshot it ever got was the empty one from before the write.
  //
  // Forced rather than auto-detected: auto-detection costs a failed connection
  // attempt on every cold start, and the answer on React Native is always the same.
  experimentalForceLongPolling: true,
});

export const functions: Functions = getFunctions(app, 'us-central1');

if (USE_EMULATORS) {
  connectAuthEmulator(auth, `http://${EMULATOR_HOST}:${EMULATOR_PORTS.auth}`, {
    disableWarnings: true,
  });
  connectFirestoreEmulator(db, EMULATOR_HOST, EMULATOR_PORTS.firestore);
  connectFunctionsEmulator(functions, EMULATOR_HOST, EMULATOR_PORTS.functions);
}
