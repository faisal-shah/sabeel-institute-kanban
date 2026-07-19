/**
 * Helpers for talking to the running emulators as a real client would.
 *
 * These tests exercise the deployed artefacts — the auth trigger and the
 * callable — rather than their extracted logic, because the logic tests cannot
 * prove the wiring is right.
 */
import { initializeApp, deleteApp, getApps, type App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

export const PROJECT_ID = 'demo-sabeel-kanban';
export const AUTH_HOST = '127.0.0.1:9099';
export const FUNCTIONS_ORIGIN = `http://127.0.0.1:5001/${PROJECT_ID}/us-central1`;

process.env.FIREBASE_AUTH_EMULATOR_HOST = AUTH_HOST;
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
process.env.GCLOUD_PROJECT = PROJECT_ID;

let app: App | undefined;

export function adminApp(): App {
  if (!app) {
    app = getApps().length ? getApps()[0] : initializeApp({ projectId: PROJECT_ID });
  }
  return app;
}

export const adminAuth = () => getAuth(adminApp());
export const adminDb = () => getFirestore(adminApp());

export async function shutdown() {
  if (app) {
    await deleteApp(app);
    app = undefined;
  }
}

/** Poll until `check` returns a value, or throw. Triggers are asynchronous. */
export async function waitFor<T>(
  label: string,
  check: () => Promise<T | undefined | null>,
  timeoutMs = 15000,
): Promise<T> {
  const started = Date.now();
  let lastErr: unknown;
  while (Date.now() - started < timeoutMs) {
    try {
      const v = await check();
      if (v !== undefined && v !== null && v !== false) return v as T;
    } catch (e) {
      lastErr = e;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(
    `Timed out waiting for ${label} after ${timeoutMs}ms${lastErr ? ` (last error: ${lastErr})` : ''}`,
  );
}

/** Poll until `check` is true, and throw if it ever becomes false-ish early. */
export async function waitUntilGone(
  label: string,
  stillThere: () => Promise<boolean>,
  timeoutMs = 15000,
): Promise<void> {
  await waitFor(label, async () => ((await stillThere()) ? undefined : true), timeoutMs);
}

/**
 * Mint a real ID token carrying the user's current custom claims, the way a
 * signed-in client would hold one. Custom token → signInWithCustomToken is the
 * only route that produces a token the callable will accept.
 */
export async function idTokenFor(uid: string): Promise<string> {
  const customToken = await adminAuth().createCustomToken(uid);
  const res = await fetch(
    `http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=fake-api-key`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: customToken, returnSecureToken: true }),
    },
  );
  if (!res.ok) throw new Error(`custom-token exchange failed: ${await res.text()}`);
  const payload = (await res.json()) as { idToken?: string };
  if (!payload.idToken) throw new Error('custom-token exchange returned no idToken');
  return payload.idToken;
}

export interface CallResult {
  status: number;
  body: { result?: unknown; error?: { status?: string; message?: string } };
}

/** Invoke a callable over HTTP exactly as the client SDK does. */
export async function callFunction(
  name: string,
  data: unknown,
  idToken?: string,
): Promise<CallResult> {
  const res = await fetch(`${FUNCTIONS_ORIGIN}/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
    },
    body: JSON.stringify({ data }),
  });
  let body: CallResult['body'] = {};
  try {
    body = (await res.json()) as CallResult['body'];
  } catch {
    // non-JSON error page; leave body empty and let the status speak
  }
  return { status: res.status, body };
}

/**
 * Create a user and wait for the auth trigger to finish provisioning it, then
 * force the claims the test needs. Tests that want a manager or admin cannot get
 * one from the trigger — everyone starts pending/member by design.
 */
export async function makeUser(opts: {
  uid: string;
  email: string;
  role?: string;
  status?: string;
  displayName?: string;
}): Promise<void> {
  await adminAuth().createUser({
    uid: opts.uid,
    email: opts.email,
    emailVerified: true,
    displayName: opts.displayName ?? opts.uid,
  });

  await waitFor(`provisioning of ${opts.uid}`, async () => {
    const snap = await adminDb().doc(`users/${opts.uid}`).get();
    return snap.exists ? snap : undefined;
  });

  if (opts.role || opts.status) {
    const role = opts.role ?? 'member';
    const status = opts.status ?? 'pending';
    await adminAuth().setCustomUserClaims(opts.uid, { role, status });
    await adminDb().doc(`users/${opts.uid}`).update({ role, status });
  }
}
