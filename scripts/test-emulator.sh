#!/usr/bin/env bash
set -euo pipefail

# The Firebase emulators require JDK 21+. Locally JDK 17 stays the default (the
# Android/Gradle build wants it), so point only the emulators at a user-local
# JDK 21. Resolution order: explicit SK_JDK21_HOME → ~/opt/jdk-21 → whatever java
# is on PATH (CI provides JDK 21 via setup-java).
if [ -n "${SK_JDK21_HOME:-}" ]; then
  export JAVA_HOME="$SK_JDK21_HOME"
elif [ -d "$HOME/opt/jdk-21" ]; then
  export JAVA_HOME="$HOME/opt/jdk-21"
fi

if [ -n "${JAVA_HOME:-}" ]; then
  export PATH="$JAVA_HOME/bin:$PATH"
fi

# Stop any resident Gradle daemon FIRST.
#
# `npm run build:apk` passes --no-daemon, but `npm run android` (expo run:android)
# does not, so a debug build leaves a daemon sitting on ~3.7 GB. This machine runs
# earlyoom with `--prefer ^(...|java|gradle)$`, so under the memory pressure of
# three emulators plus that daemon it kills a JVM — and the one it takes is
# usually the Firestore emulator, mid-suite.
#
# The reason this is worth a guard rather than a note: the symptom does not look
# like memory pressure. It presents as ECONNREFUSED and a wall of failed and
# skipped tests, i.e. exactly like a broken diff, and you go looking at your own
# changes. Reported by the time-tracker maintainer, who lost three runs to it.
#
# Stopping the daemon here rather than disabling it globally keeps the dev build
# loop fast; it only costs a cold Gradle start on the next build.
if [ -x app/android/gradlew ]; then
  (cd app/android && ./gradlew --stop >/dev/null 2>&1) || true
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
  --only firestore \
  "npm run test:integration:rules -w functions"

exec firebase emulators:exec \
  --project demo-sabeel-kanban \
  --only firestore,auth,functions \
  "npm run test:integration:fn -w functions"
