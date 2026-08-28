/**
 * Where the emulators actually are, for `initializeTestEnvironment`.
 *
 * Read from the env vars `emulators:exec` exports
 * (`firebase-tools/lib/emulator/env.js`) — NEVER from a literal. The rules
 * suites used to hardcode `port: 8080` / `port: 9199`, which meant they ignored
 * `firebase.json` entirely: move the config and the suite would still connect to
 * 8080, and on this machine that could be a SIBLING checkout's Firestore, which
 * reads and writes happily and lets the suite pass against the wrong database.
 *
 * No fallback, deliberately. An unset var means the suite is running outside the
 * wrapper, and defaulting would aim it at whatever holds the port.
 */
function hostPort(envName: string): { host: string; port: number } {
  const value = process.env[envName];
  if (!value) {
    throw new Error(`${envName} is unset — run the rules tests via npm run test:emulator`);
  }
  const [host, port] = value.split(':');
  // Literal 127.0.0.1, never 'localhost': the emulators bind IPv4 only, while
  // 'localhost' can resolve to IPv6 ::1 first and fail at connect.
  return { host: host || '127.0.0.1', port: Number(port) };
}

export const firestoreHostPort = () => hostPort('FIRESTORE_EMULATOR_HOST');
export const storageHostPort = () => hostPort('FIREBASE_STORAGE_EMULATOR_HOST');
