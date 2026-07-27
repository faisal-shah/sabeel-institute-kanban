import {
  EMULATOR_PROJECT_ID,
  EMULATOR_STORAGE_BUCKET,
  STORAGE_BUCKET,
} from '@sabeel/shared';
import { USE_EMULATORS } from './env';

/**
 * Firebase web app config. NOT SECRET — this is public by design and is meant to
 * be committed (access is controlled by Firestore rules, never by hiding these).
 *
 * Real values for the `sabeel-institute-kanban` project (registered 2026-07-19).
 * Local development still runs against the emulators — see USE_EMULATORS below.
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
  storageBucket: STORAGE_BUCKET,
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
 * The emulator project id now lives in `@sabeel/shared` — functions need it too,
 * to decide whether they may take the emulator branch of the signed-URL seam,
 * and the app and functions must never each hold their own copy of a rule.
 */
export { EMULATOR_PROJECT_ID };

/**
 * Emulator mode overrides the project id AND the bucket. Overriding only the
 * project id leaves the client uploading to the real bucket while every
 * server-side path looks in the emulator's — and the sole symptom is a finalize
 * step reporting no file found for an upload that plainly succeeded.
 */
export const firebaseConfig = USE_EMULATORS
  ? {
      ...realConfig,
      projectId: EMULATOR_PROJECT_ID,
      storageBucket: EMULATOR_STORAGE_BUCKET,
    }
  : realConfig;

/**
 * True while the config above has not been replaced with real values.
 *
 * Kept after the real config landed: it is what the gate screens use to explain
 * "this build has no backend" rather than failing with a network error, and it
 * would silently start lying if deleted the moment it read false.
 */
export const IS_PLACEHOLDER_CONFIG = realConfig.apiKey === 'demo-api-key';
