/**
 * This checkout's Firebase emulator and dev-server ports — the one place
 * `scripts/*.mjs` read them.
 *
 * Several files have to agree and cannot share a representation: this one (ESM),
 * `firebase.json` (JSON, what the emulators bind), `app/src/env.ts` (TS, inlined
 * into the client bundle at build time), the `PORTS=(…)` array in `dev.sh` and
 * the `WEB_PORT` in `e2e.sh` (shell). The copies are unavoidable; the copies
 * drifting is not. `functions/test/unit/emulatorPorts.test.ts` asserts they
 * agree, so a change to one of them fails the unit suite in seconds rather than
 * surfacing later as an emulator answering on a port nobody expected — or, far
 * worse, as a SIBLING repo's emulator answering, which reads and writes happily
 * and passes.
 */
export const EMULATOR_PORTS = {
  firestore: 8080,
  firestoreWebsocket: 9150,
  auth: 9099,
  functions: 5001,
  storage: 9199,
  ui: 4000,
  hub: 4400,
  logging: 4500,
};

/** The Expo web dev server the browser suites drive. */
export const WEB_PORTS = {
  e2e: 8086,
};

/**
 * Ports that are genuinely machine-wide and cannot be moved into a per-repo
 * block: Metro (the Android emulator reaches the host directly at
 * `10.0.2.2:8081`, so `adb reverse` cannot redirect it) and `idb`. Listed here
 * so the sweeps can free them, and so it is obvious they are shared.
 */
export const SHARED_PORTS = {
  metro: 8081,
  idb: 10882,
};
