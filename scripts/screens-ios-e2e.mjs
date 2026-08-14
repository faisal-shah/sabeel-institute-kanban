/**
 * The iOS half of the screen sweep. Every screen it visits is REACHED BY
 * ACCESSIBILITY LABEL and then looked at.
 *
 *   bash scripts/dev.sh ios                  # bring the stack up first
 *   node scripts/screens-ios-e2e.mjs         # then sweep
 *   SK_IOS_SIM='iPhone 17' node scripts/screens-ios-e2e.mjs
 *
 * WHY THIS EXISTS, and why it is not just screens-e2e with a different driver:
 * `screens-e2e.mjs` covers web, and a green web run says nothing about a native
 * layout. But the sharper gap is that **nothing checked iOS accessibility labels
 * at all**. `CLAUDE.md` requires every icon-only control to carry an
 * `accessibilityLabel` naming the word it replaces, and on iOS that rule was
 * enforced by nobody.
 *
 * THIS SUITE IS THAT CHECK, expressed as navigation: every step below taps a
 * control **by its label**. Delete an `accessibilityLabel`, rename it, or ship
 * an icon with none, and the step that touches it fails. A tour that can only
 * take screenshots proves nothing — this one cannot pass without the labels
 * being right.
 *
 * WHAT IT DOES NOT DO, stated plainly rather than implied:
 *   - It does not sweep widths. A browser takes any viewport; a simulator is
 *     whatever device you booted. Run it against a second device to cover the
 *     other side of the breakpoint (an iPad crosses it, an iPhone does not).
 *   - It does not assert "every button on screen has a label". Maestro's iOS
 *     hierarchy exposes text and bounds but no element TYPE, so buttons cannot
 *     be told from labels generically. It checks the labels it navigates by,
 *     which is a real subset, not the whole rule.
 *   - It covers the tab-bar screens and the board, not the More sheet's
 *     screens. Extending it is adding entries to SCREENS below.
 *
 * DRIVER: Maestro, not idb. idb's last release is 2022-08-11 and its companion
 * degrades mid-run against iOS 26 — a tap returns exit 0 and does nothing,
 * which is the worst possible failure mode for a regression harness. Maestro
 * ships monthly and drives the simulator without touching `app/ios/`, which
 * matters because prebuild regenerates that folder.
 *
 * ── STATUS, 2026-08-14: NOT YET GREEN. Read this before trusting it. ────────
 *
 * Maestro drove this app correctly when first installed — launch with
 * `clearState`, tap `faisal` by label, assert `Boards`, all passing. It has not
 * done so since. Every run now dies before the first step with
 *
 *   IOSDriverTimeoutException: iOS driver not ready in time
 *
 * which is MAESTRO'S OWN XCUITest driver failing to install and start on the
 * simulator — not this suite, not a selector, and not the app. Raising
 * MAESTRO_DRIVER_STARTUP_TIMEOUT to 240s, rebooting the simulator, clearing
 * `~/.maestro/tests` and the `maestro_xctestrunner_*` temp trees, and
 * uninstalling the driver from the device so it rebuilds all failed to bring it
 * back. Suspected fallout from repeatedly killing CoreSimulatorService while
 * diagnosing the `simctl diagnose` lock below; a host reboot is the untried fix.
 *
 * The logic here is nonetheless worth keeping: every fix below came from a REAL
 * failure this suite surfaced, and the screens it names are correct. What is
 * unproven is only whether a full run goes green. Treat the first successful run
 * as the acceptance test, and delete this block when it passes.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const SIM = process.env.SK_IOS_SIM ?? 'iPhone 17 Pro';
const BUNDLE = 'com.sabeelinstitute.kanban';
const SHOTS = join(ROOT, 'shots', 'screens-ios');
const FLOWS = join(ROOT, 'shots', 'screens-ios', '.flows');

/**
 * The board row's accessible name is the WHOLE row, not just its title —
 * "Fundraising 2026, 14 cards · 3 members". That is correct for a screen reader,
 * and it is why this is a REGEX: Maestro matches the whole accessible string,
 * so `tapOn: "Fundraising 2026"` finds nothing and fails in a way that reads as
 * a broken tap rather than a selector that does not match.
 */
const BOARD_ROW = '.*Fundraising 2026.*';

/** Get back to the hub screen after a failure, so one bad step is not six. */
const RESET = [{ launchApp: { clearState: true } }, { tapOn: 'faisal' }];

/**
 * Each entry is one screen: how to get there from the previous one, and what
 * must be visible once you arrive. `assert` entries are what make this a test —
 * they are checked by Maestro and fail the run.
 */
const SCREENS = [
  {
    name: '01-signin',
    steps: [{ launchApp: { clearState: true } }],
    assert: ['Dev sign-in (emulator only)', 'Sign in with Google'],
    // A DEBUG build fetches its whole JS bundle from Metro on a cold start —
    // ~30s here, and far more on a cold Metro cache. Maestro's default assert
    // timeout is a few seconds, so without this the suite fails on a screen
    // that is merely still loading, and the screenshot shows it rendered fine.
    // That is the most misleading failure a harness can produce.
    timeout: 120000,
  },
  {
    name: '02-boards',
    steps: [{ tapOn: 'faisal' }],
    assert: ['Boards', 'New board'],
  },
  {
    // `Back` is asserted by NAME because CLAUDE.md requires the header control
    // to be the arrow-back icon labelled exactly "Back". If someone ships the
    // word, or drops the label, this is what notices.
    name: '03-board',
    steps: [{ tapOn: BOARD_ROW }],
    assert: ['Back'],
    // Return to the hub so the tab-bar screens below start from a known place.
    after: [{ tapOn: 'Back' }],
  },
  { name: '04-my-work', steps: [{ tapOn: 'My Work' }], assert: ['My work'] },
  { name: '05-search', steps: [{ tapOn: 'Search' }], assert: ['Search'] },
  { name: '06-alerts', steps: [{ tapOn: 'Alerts' }], assert: ['Alerts'] },
];

/**
 * Every shell-out is bounded. `xcrun simctl` can hang indefinitely when
 * CoreSimulator is busy — observed while writing this — and an unbounded
 * execFileSync turns that into a suite that never returns, which is worse than
 * one that fails.
 */
const sh = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { encoding: 'utf8', timeout: 90000, ...opts });

function requireBooted() {
  let listed;
  try {
    listed = sh('xcrun', ['simctl', 'list', 'devices', '--json']);
  } catch (err) {
    // A WEDGED CoreSimulator, not a missing device. Interrupting a Maestro run
    // (Ctrl-C, a killed CI job) can leave its XCUITest runner attached, after
    // which every simctl call hangs forever rather than erroring. The bounded
    // `sh` turns that into this message instead of a suite that never returns.
    if (err.code === 'ETIMEDOUT') {
      throw new Error(
        'xcrun simctl is not responding — CoreSimulator is wedged.\n' +
          'Almost always a leftover `simctl diagnose --timeout=600` started by a\n' +
          'FAILED Maestro flow, which holds CoreSimulator for ten minutes. Fix:\n' +
          '  pkill -9 -f "simctl diagnose"; pkill -9 -f maestro-driver-ios\n' +
          '  pkill -9 -f com.apple.CoreSimulator.CoreSimulatorService\n' +
          '  bash scripts/dev.sh ios',
      );
    }
    throw err;
  }
  const json = JSON.parse(listed);
  const booted = Object.values(json.devices)
    .flat()
    .find((d) => d.name === SIM && d.state === 'Booted');
  if (!booted) {
    throw new Error(
      `No booted simulator named "${SIM}".\n` +
        `Run: bash scripts/dev.sh ios   (it boots, seeds and launches)`,
    );
  }
  return booted.udid;
}

/** Metro must be serving, or the debug build shows a red screen and every step fails. */
function requireMetro() {
  try {
    sh('bash', ['-c', 'curl -sf -o /dev/null --max-time 3 http://127.0.0.1:8081/status']);
  } catch {
    throw new Error(
      'Metro is not serving on 8081, so the debug build has no bundle.\n' +
        'Run: bash scripts/dev.sh ios',
    );
  }
}

/** A flow is YAML; generating it keeps the screen list above in ONE place. */
function writeFlow(name, steps) {
  const body = steps
    .map((step) => {
      const [k, v] = Object.entries(step)[0];
      if (typeof v === 'string') return `- ${k}: ${JSON.stringify(v)}`;
      const inner = Object.entries(v)
        .map(([ik, iv]) => `    ${ik}: ${JSON.stringify(iv)}`)
        .join('\n');
      return `- ${k}:\n${inner}`;
    })
    .join('\n');
  const path = join(FLOWS, `${name}.yaml`);
  writeFileSync(path, `appId: ${BUNDLE}\n---\n${body}\n`);
  return path;
}

/**
 * Maestro installs and starts its own XCUITest driver on the simulator before
 * running a single step, and its default startup budget is far too short here —
 * the failure is `IOSDriverTimeoutException: iOS driver not ready in time`,
 * which names Maestro's driver and not your app, but arrives as a plain flow
 * failure and reads like a broken selector.
 */
const MAESTRO_ENV = {
  ...process.env,
  MAESTRO_DRIVER_STARTUP_TIMEOUT: process.env.MAESTRO_DRIVER_STARTUP_TIMEOUT ?? '180000',
};

const runFlow = (name, steps) =>
  sh('bash', ['-c', `maestro test ${JSON.stringify(writeFlow(name, steps))} 2>&1`], {
    timeout: 300000,
    env: MAESTRO_ENV,
  });

/**
 * Clear up after a FAILED Maestro flow, before touching simctl again.
 *
 * This is the single nastiest thing about driving a simulator: when a flow
 * fails, Maestro's XCUITest runner collects simulator diagnostics, and it does
 * that by running
 *
 *   simctl diagnose -l -b --timeout=600 ...
 *
 * which holds CoreSimulator for up to TEN MINUTES. Every subsequent `xcrun
 * simctl` — including the screenshot of the very failure you are trying to
 * capture — then blocks. One failing screen turns into a wedged machine and a
 * run whose remaining results are all lies.
 *
 * So: reap the diagnostics run and the driver behind it. Nothing here is the
 * app's, and all of it is recreated by the next flow.
 */
function reapMaestro() {
  for (const pat of ['simctl diagnose', 'maestro-driver-ios', 'maestro_xctestrunner']) {
    try {
      sh('pkill', ['-9', '-f', pat], { timeout: 10000, stdio: 'ignore' });
    } catch {
      // pkill exits non-zero when nothing matched, which is the common case.
    }
  }
}

const shot = (udid, name) => {
  try {
    sh('xcrun', ['simctl', 'io', udid, 'screenshot', join(SHOTS, `${name}.png`)], {
      stdio: 'ignore',
    });
  } catch {
    // Never let a screenshot decide the run. This is called on the failure path
    // too, where simctl may itself be unhappy, and a throw here would replace a
    // real finding with a confusing one about PNGs.
  }
};

// ---------------------------------------------------------------- run

const udid = requireBooted();
requireMetro();
rmSync(SHOTS, { recursive: true, force: true });
mkdirSync(FLOWS, { recursive: true });

console.log(`sweeping ${SCREENS.length} screens on ${SIM}\n`);

const failures = [];
let needsReset = false;
for (const screen of SCREENS) {
  // One bad step should not report five more. Get back to the hub first, so
  // each failure below is its own finding rather than an echo of the last.
  if (needsReset) {
    process.stdout.write('  (reset) ... ');
    try {
      runFlow('00-reset', RESET);
      needsReset = false;
      console.log('ok');
    } catch {
      console.log('FAILED — cannot reach the hub, aborting the rest');
      failures.push({ name: '(reset)', out: 'could not return to Boards' });
      break;
    }
  }

  process.stdout.write(`  ${screen.name} ... `);
  try {
    // `extendedWaitUntil` rather than `assertVisible`: it is the same assertion
    // with a timeout we control. A screen that is still rendering is not a
    // screen that is wrong, and every one of these is a real network round trip
    // to the emulators.
    runFlow(screen.name, [
      ...screen.steps,
      ...screen.assert.map((a) => ({
        extendedWaitUntil: { visible: a, timeout: screen.timeout ?? 30000 },
      })),
    ]);
    // Screenshot through simctl, not Maestro: Maestro sandboxes takeScreenshot
    // to its own run folder, and these belong beside the web sweep's shots.
    // Taken BEFORE `after`, so the image is the screen, not what follows it.
    shot(udid, screen.name);
    if (screen.after) runFlow(`${screen.name}-after`, screen.after);
    console.log('ok');
  } catch (err) {
    console.log('FAILED');
    // BEFORE the screenshot, not after: the diagnostics dump Maestro starts on
    // failure would otherwise block simctl and cost us the picture too.
    reapMaestro();
    // Keep the shot anyway — a failure you can look at beats one you cannot.
    shot(udid, `${screen.name}-FAILED`);
    needsReset = true;
    // Keep the WHOLE output on disk and only summarise to the console. The
    // first version filtered to lines matching a pattern and printed nothing at
    // all when the pattern missed — a failure you cannot read is barely better
    // than one you were never told about.
    const full = String(err.stdout || '') + String(err.stderr || '') + `\n${err.message}`;
    const logPath = join(SHOTS, `${screen.name}-FAILED.log`);
    writeFileSync(logPath, full);
    const summary =
      full
        .split('\n')
        .filter((l) => /FAILED|Assert|Tap|Element|not found|timed out/i.test(l))
        .slice(0, 5)
        .join('\n      ') || `(no matching lines — full output in ${logPath})`;
    failures.push({ name: screen.name, out: summary });
  }
}

console.log(`\nshots/screens-ios/ — ${SCREENS.length} screens on ${SIM}`);

if (failures.length) {
  console.error(`\n${failures.length} screen(s) failed:\n`);
  for (const f of failures) console.error(`  ${f.name}\n      ${f.out}\n`);
  console.error(
    'A step that fails on a tapOn is usually a MISSING OR RENAMED\n' +
      'accessibilityLabel, not a broken tap — that is what this suite is for.',
  );
  process.exit(1);
}
console.log('every screen reached by label, and looked at.');
