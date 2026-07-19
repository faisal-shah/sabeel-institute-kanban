import { USE_EMULATORS } from './env';

/**
 * Firebase web app config. NOT SECRET — this is public by design and is meant to
 * be committed (access is controlled by Firestore rules, never by hiding these).
 *
 * PLACEHOLDER until the real Firebase project exists. Everything before the
 * production deploy runs against the emulators. Replace per TODO.md § D.
 */
const realConfig = {
  apiKey: 'demo-api-key',
  authDomain: 'sabeel-institute-kanban.firebaseapp.com',
  projectId: 'sabeel-institute-kanban',
  storageBucket: 'sabeel-institute-kanban.appspot.com',
  messagingSenderId: '000000000000',
  appId: '1:000000000000:web:0000000000000000000000',
};

/**
 * The project id the emulators run under. Everything server-side —
 * `firebase emulators:exec --project`, the Functions runtime, the Admin SDK in
 * scripts and tests — uses this id.
 *
 * THE CLIENT MUST USE IT TOO. The Firestore emulator partitions data by project
 * id, so a client configured with a different id talks to a *different database
 * inside the same emulator*. The symptom is brutal to diagnose: writes succeed,
 * the trigger logs success, and the client's listener returns a server snapshot
 * (fromCache=false) saying the document does not exist — because in its
 * namespace, it doesn't. Cost an hour on 2026-07-19.
 */
export const EMULATOR_PROJECT_ID = 'demo-sabeel-kanban';

export const firebaseConfig = USE_EMULATORS
  ? { ...realConfig, projectId: EMULATOR_PROJECT_ID }
  : realConfig;

/** True while the placeholder above has not been replaced with real values. */
export const IS_PLACEHOLDER_CONFIG = realConfig.apiKey === 'demo-api-key';
