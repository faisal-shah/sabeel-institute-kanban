import { USE_EMULATORS } from './env';

/**
 * Firebase web app config. NOT SECRET — this is public by design and is meant to
 * be committed (access is controlled by Firestore rules, never by hiding these).
 *
 * Real values for the `sabeel-institute-kanban` project (registered 2026-07-19).
 * Local development still runs against the emulators — see USE_EMULATORS below.
 *
 * `storageBucket` is recorded because Firebase hands it to us, NOT because it is
 * used: attachments are deliberately out of scope and no Storage bucket is
 * provisioned. Do not start using it without revisiting that decision.
 */
const realConfig = {
  apiKey: 'AIzaSyDnHBj4vlBquHotVRjexa2yB1_x18XWqaI',
  // The HOSTING domain, not firebaseapp.com. Hosting serves /__/auth/* itself,
  // so the whole sign-in redirect stays same-origin — required in
  // storage-partitioned browsers (the in-app webviews people arrive in from a
  // WhatsApp or Slack link), where the cross-origin helper dies with
  // "missing initial state". Redirect URI registered on the Web OAuth client
  // 2026-07-19; the firebaseapp.com entries are kept as a working fallback.
  authDomain: 'sabeel-institute-kanban.web.app',
  projectId: 'sabeel-institute-kanban',
  storageBucket: 'sabeel-institute-kanban.firebasestorage.app',
  messagingSenderId: '826656438175',
  appId: '1:826656438175:web:d9d89ccb61181de5c5efaa',
};

/**
 * The WEB OAuth client id, read from `google-services.json` (`client_type: 3`).
 *
 * Native Google Sign-In wants the WEB client id as `webClientId`, not the
 * Android one — passing the Android id is a classic source of DEVELOPER_ERROR.
 * Public, not secret.
 */
export const WEB_CLIENT_ID =
  '826656438175-if1oi85tn29orcmkaenlsg9r7eca9nha.apps.googleusercontent.com';

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

/**
 * True while the config above has not been replaced with real values.
 *
 * Kept after the real config landed: it is what the gate screens use to explain
 * "this build has no backend" rather than failing with a network error, and it
 * would silently start lying if deleted the moment it read false.
 */
export const IS_PLACEHOLDER_CONFIG = realConfig.apiKey === 'demo-api-key';
