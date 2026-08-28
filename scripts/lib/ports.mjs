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
 *
 * 61200+ because this machine's ephemeral range is 32768-60999
 * (`/proc/sys/net/ipv4/ip_local_port_range`), so nothing above it is handed out
 * at random, and Firebase's own defaults top out at 9499
 * (`firebase-tools/lib/emulator/constants.js`), so the block collides with
 * nothing the CLI would pick for itself. The bases are 100 apart, one per repo
 * on this machine, so `61203` reads as "this project, functions" at a glance —
 * the diagnostic that was missing when one session killed another's emulator
 * after misreading a truncated `ps` line.
 */
const PORT_BASE = 61200;

export const EMULATOR_PORTS = {
  firestore: PORT_BASE + 0,
  firestoreWebsocket: PORT_BASE + 1,
  auth: PORT_BASE + 2,
  functions: PORT_BASE + 3,
  ui: PORT_BASE + 4,
  hub: PORT_BASE + 5,
  logging: PORT_BASE + 6,
  storage: PORT_BASE + 7,
};

/** The Expo web dev server the browser suites drive. */
export const WEB_PORTS = {
  e2e: PORT_BASE + 10,
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
