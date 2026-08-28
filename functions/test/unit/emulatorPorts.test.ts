import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Every place this checkout states an emulator or dev-server port agrees.
 *
 * Three Sabeel repos share one machine, and every one of them used to pin the
 * same ports — so whichever suite started second SIGTERMed the other's
 * Firestore, and both sessions spent real time diagnosing symptoms that belonged
 * to the other process. Each checkout now owns a disjoint block.
 *
 * The ports cannot live in one file. Five consumers need five representations:
 *
 *   firebase.json               JSON   what the emulators actually bind
 *   app/src/env.ts              TS     inlined into the client bundle
 *   scripts/lib/ports.mjs       ESM    read by scripts/*.mjs
 *   scripts/dev.sh              shell  the kill list
 *   scripts/e2e.sh              shell  the web dev-server port
 *
 * So the goal is not one copy, it is copies that cannot drift. A mismatch is
 * otherwise silent until something connects to a port nobody is serving — or,
 * far worse, to a port a SIBLING REPO is serving, which reads and writes
 * happily and passes.
 *
 * Same reasoning as `suite-coverage.test.ts` next door: a unit test that asserts
 * about repo files rather than about functions.
 */
// Paths resolve from the functions workspace, which is vitest's cwd here — the
// same convention `suite-coverage.test.ts` and the rules suites already use
// (`readFileSync('../firestore.rules')`). The meta-property form is unavailable:
// this workspace compiles as commonjs.
const REPO = resolve('..');
const read = (p: string) => readFileSync(resolve(REPO, p), 'utf8');

/** `firebase.json` — what the emulator suite binds. */
function portsFromFirebaseJson(): Record<string, number> {
  const emulators = JSON.parse(read('firebase.json')).emulators as Record<
    string,
    { port?: number; websocketPort?: number }
  >;
  const out: Record<string, number> = {};
  for (const [service, cfg] of Object.entries(emulators)) {
    if (cfg && typeof cfg.port === 'number') out[service] = cfg.port;
    if (cfg && typeof cfg.websocketPort === 'number') {
      out.firestoreWebsocket = cfg.websocketPort;
    }
  }
  return out;
}

/**
 * The client's copy. Parsed rather than imported: `app/src/env.ts` imports
 * `react-native`, which will not load under the functions workspace's vitest.
 */
function portsFromClient(): Record<string, number> {
  const block = read('app/src/env.ts').match(/EMULATOR_PORTS\s*=\s*\{([^}]*)\}/)?.[1];
  if (!block) throw new Error('EMULATOR_PORTS not found in app/src/env.ts');
  return Object.fromEntries(
    [...block.matchAll(/(\w+)\s*:\s*(\d+)/g)].map((m) => [m[1], Number(m[2])]),
  );
}

/** The scripts' copy. */
async function portsFromScripts(): Promise<{
  emulator: Record<string, number>;
  web: Record<string, number>;
  shared: Record<string, number>;
}> {
  const mod = await import(resolve(REPO, 'scripts/lib/ports.mjs'));
  return { emulator: mod.EMULATOR_PORTS, web: mod.WEB_PORTS, shared: mod.SHARED_PORTS };
}

/** `dev.sh`'s kill list — a flat set of numbers. */
function portsFromDevSh(): number[] {
  const line = read('scripts/dev.sh').match(/^PORTS=\(([^)]*)\)/m)?.[1];
  if (!line) throw new Error('PORTS=(…) not found in scripts/dev.sh');
  return line.trim().split(/\s+/).map(Number);
}

/** `e2e.sh`'s web dev-server port, set in shell before Node ever sees it. */
function webPortFromE2eSh(): number {
  const m = read('scripts/e2e.sh').match(/^WEB_PORT=(\d+)/m);
  if (!m) throw new Error('WEB_PORT not found in scripts/e2e.sh');
  return Number(m[1]);
}

/**
 * This checkout's block. Bases are 100 apart, one per repo on this machine.
 *
 * 61200+ because the ephemeral range here is 32768-60999
 * (`/proc/sys/net/ipv4/ip_local_port_range`) so nothing above it is handed out
 * at random, and Firebase's own defaults top out at 9499
 * (`firebase-tools/lib/emulator/constants.js`) so the block collides with
 * nothing the CLI would choose for itself.
 *
 * Metro (8081) and idb (10882) are deliberately OUTSIDE it: the Android
 * emulator reaches the host directly at 10.0.2.2:8081, so that port cannot be
 * redirected or moved. They are machine-wide and shared by agreement, not by
 * allocation.
 */
const BLOCK_START = 61200;
const BLOCK_END = BLOCK_START + 99;

describe('emulator ports agree across every file that states them', () => {
  it('every allocated port is inside this checkout\u2019s block', async () => {
    const { emulator, web } = await portsFromScripts();
    const all = { ...emulator, ...web };
    expect(Object.keys(all).length).toBeGreaterThan(0);

    for (const [service, port] of Object.entries(all)) {
      expect(
        port >= BLOCK_START && port <= BLOCK_END,
        `${service}=${port} is outside ${BLOCK_START}-${BLOCK_END} — that is another checkout's territory`,
      ).toBe(true);
    }
  });

  it('no two services claim the same port', async () => {
    const { emulator, web, shared } = await portsFromScripts();
    expect(Object.keys(emulator).length).toBeGreaterThan(0);

    const all = [...Object.values(emulator), ...Object.values(web), ...Object.values(shared)];
    expect(new Set(all).size, 'two services claim the same port').toBe(all.length);
  });

  it('firebase.json matches scripts/lib/ports.mjs', async () => {
    const { emulator } = await portsFromScripts();
    const config = portsFromFirebaseJson();

    // Guard the guard: an empty parse would make every comparison below
    // trivially true, which is the failure mode this whole file exists to stop.
    expect(Object.keys(config).length).toBeGreaterThan(0);

    for (const [service, port] of Object.entries(config)) {
      expect(emulator[service], `firebase.json ${service}=${port}`).toBe(port);
    }
  });

  it('the client bundle uses the same ports as the scripts', async () => {
    const { emulator } = await portsFromScripts();
    const client = portsFromClient();
    expect(Object.keys(client).length).toBeGreaterThan(0);

    for (const [service, port] of Object.entries(client)) {
      expect(emulator[service], `app/src/env.ts ${service}=${port}`).toBe(port);
    }
  });

  it('dev.sh frees exactly this checkout’s ports, and nothing else', async () => {
    const { emulator, web, shared } = await portsFromScripts();
    const listed = portsFromDevSh();
    expect(listed.length).toBeGreaterThan(0);

    const owned = new Set([
      ...Object.values(emulator),
      ...Object.values(web),
      ...Object.values(shared),
    ]);

    // Every port we bind must be swept…
    for (const [service, port] of Object.entries({ ...emulator, ...web })) {
      expect(listed, `${service}=${port} is not in dev.sh's PORTS`).toContain(port);
    }
    // …and nothing else, or the sweep reaches into another checkout's block.
    // That is not hypothetical: on 2026-08-27 a port-based sweep killed a
    // sibling repo's running emulator.
    for (const port of listed) {
      expect(owned.has(port), `dev.sh sweeps ${port}, which this checkout does not own`).toBe(true);
    }
  });

  it('e2e.sh and the scripts agree on the web port', async () => {
    const { web } = await portsFromScripts();
    expect(webPortFromE2eSh(), 'e2e.sh WEB_PORT vs WEB_PORTS.e2e').toBe(web.e2e);
  });
});

/**
 * The ports module has to be COMMITTED, not merely present.
 *
 * `.gitignore` carried a bare `lib/`, which matches a directory of that name at
 * any depth — so `scripts/lib/` was silently ignored while sitting happily on
 * disk. Every check above passed locally and would have failed for anyone else,
 * because the file the suite imports was never in the repo. An ignored-but-
 * present file is indistinguishable from a committed one on the machine that
 * wrote it, which is why this is asserted rather than eyeballed.
 */
describe('the ports module is committed, not just present on disk', () => {
  it('git tracks scripts/lib/ports.mjs', () => {
    const tracked = execFileSync('git', ['ls-files', '--', 'scripts/lib/ports.mjs'], {
      cwd: REPO,
      encoding: 'utf8',
    }).trim();
    expect(tracked, 'scripts/lib/ports.mjs is not tracked — check .gitignore').toBe(
      'scripts/lib/ports.mjs',
    );
  });
});
