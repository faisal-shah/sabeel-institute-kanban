/**
 * Firebase singletons — WEB. See firebase.ts for the native variant and why the
 * two differ.
 *
 * Web gets the real persistent cache (IndexedDB), so a board opened before going
 * offline still renders after a reload, and queued writes survive.
 */
import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, type Auth } from 'firebase/auth';
import {
  connectFirestoreEmulator,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions, type Functions } from 'firebase/functions';
import { firebaseConfig } from './firebase-config';
import { EMULATOR_HOST, EMULATOR_PORTS, USE_EMULATORS } from './env';

export const app: FirebaseApp = getApps().length
  ? getApps()[0]
  : initializeApp(firebaseConfig);

export const auth: Auth = getAuth(app);

export const db: Firestore = initializeFirestore(app, {
  localCache: persistentLocalCache({
    // People leave the board open in several tabs; without this only one tab
    // gets persistence and the others silently fall back to memory.
    tabManager: persistentMultipleTabManager(),
  }),
  // Firestore's default WebChannel transport is fast but not always reliable —
  // some proxies, corporate networks and local emulator setups let the FIRST
  // response through and then quietly drop the stream. The failure is invisible:
  // no error fires, the listener simply never receives another snapshot, and the
  // app sits on a spinner while the server has done everything right. We hit it
  // intermittently against the emulator on 2026-07-19.
  //
  // Auto-detect rather than force: it falls back to long polling only when the
  // stream actually fails, so a healthy connection keeps the faster transport.
  // (React Native has no working WebChannel at all, so firebase.ts forces it —
  // see docs/INHERITED-STACK.md lesson 10.)
  experimentalAutoDetectLongPolling: true,
});

export const functions: Functions = getFunctions(app, 'us-central1');

if (USE_EMULATORS) {
  connectAuthEmulator(auth, `http://${EMULATOR_HOST}:${EMULATOR_PORTS.auth}`, {
    disableWarnings: true,
  });
  connectFirestoreEmulator(db, EMULATOR_HOST, EMULATOR_PORTS.firestore);
  connectFunctionsEmulator(functions, EMULATOR_HOST, EMULATOR_PORTS.functions);
}
