#!/usr/bin/env bash
set -euo pipefail

# The Firebase emulators require JDK 21+. Locally JDK 17 may stay the default
# (the Android/Gradle build wants it), so this points only the emulators at 21.
# shellcheck source=scripts/jdk21.sh
. "$(dirname "$0")/jdk21.sh"

# Stop any resident Gradle daemon FIRST.
#
# `npm run build:apk` passes --no-daemon, but `npm run android` (expo run:android)
# does not, so a debug build leaves a daemon sitting on ~3.7 GB, which can matter
# alongside three emulators.
#
# This used to run `./gradlew --stop` unconditionally. It no longer does, for two
# reasons, both established on 2026-08-28:
#
#   1. `--stop` is MACHINE-WIDE. GRADLE_USER_HOME is unset in all three Sabeel
#      checkouts, so they share one daemon registry and stopping "the" daemon
#      stops the one a SIBLING session is mid-build on. It surfaces there as
#      "Gradle build daemon disappeared unexpectedly" in a repo nobody touched —
#      the same class of cross-repo damage the per-repo emulator ports fixed.
#
#   2. The justification was wrong. The old comment here said this machine runs
#      earlyoom with a --prefer list making the Firestore emulator the designated
#      victim. It does not run earlyoom at all — no binary, no unit, no process —
#      and the box has 15 GiB of RAM plus a 16 GiB swapfile, so contention shows
#      up first as thrashing, not as a kill.
#
# So: report, do not kill. Set SK_STOP_GRADLE=1 to opt in when you know no other
# session is building.
if [ -x app/android/gradlew ]; then
  if [ "${SK_STOP_GRADLE:-0}" = "1" ]; then
    (cd app/android && ./gradlew --stop >/dev/null 2>&1) || true
    echo "Gradle daemons stopped (SK_STOP_GRADLE=1) — machine-wide, all checkouts."
  elif pgrep -f GradleDaemon >/dev/null 2>&1; then
    # pgrep is safe HERE (unlike in free-emulator-ports.sh): this script's own
    # command line is `bash scripts/test-emulator.sh`, which cannot match.
    echo "note: a Gradle daemon is running (~3.7 GB). It is shared with the sibling"
    echo "      checkouts, so this script will not stop it. If memory is tight and"
    echo "      nothing else is building:  SK_STOP_GRADLE=1 npm run test:emulator"
  fi
fi

# The functions emulator runs the BUILT bundle, so build before starting it.
# This also means the integration suite exercises the same esbuild output that
# gets deployed, not the TypeScript sources.
npm run build -w functions

# The integration suite runs in TWO passes against DIFFERENT emulator sets:
#
#  1. RULES tests (firestore only). They use rules-unit-testing + clearFirestore,
#     and need no functions. Running them with NO functions emulator is the point:
#     otherwise clearFirestore's mass-deletes fire onCardDeleted, whose async
#     recursiveDelete can race a reused card id and delete a freshly-seeded card
#     mid-test. No functions running → no such trigger → no flake. (concurrentMoves
#     rides along here: it only writes cards via the Admin SDK and asserts ranking.)
#
#  2. FN tests (firestore + auth + functions). These exercise the auth-create
#     trigger, the callables, and the notification/activity/cleanup triggers for
#     real — the whole reason functions are in an emulator set at all. They use
#     unique ids and never clearFirestore, so the trigger above cannot collide.
firebase emulators:exec \
  --project demo-sabeel-kanban \
  --only firestore,storage \
  "npm run test:integration:rules -w functions"

exec firebase emulators:exec \
  --project demo-sabeel-kanban \
  --only firestore,auth,functions,storage \
  "npm run test:integration:fn -w functions"
