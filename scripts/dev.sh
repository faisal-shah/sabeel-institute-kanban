#!/usr/bin/env bash
# One entry point for the local dev loop, so nobody re-derives it under pressure.
#
#   scripts/dev.sh status     what is running, and who owns each port
#   scripts/dev.sh stop       free EVERY port this project uses
#   scripts/dev.sh web        stop, start emulators + web, seed
#   scripts/dev.sh android    stop, start emulators + Metro for the device build
#   scripts/dev.sh ios        stop, start emulators + web + Metro, seed, launch the
#                             simulator app (add --build to compile and install first)
#   scripts/dev.sh e2e        stop, then run the full suite (it manages its own)
#
# Why this exists: half a dozen debugging sessions were lost to a stale emulator
# or Metro holding a port, which fails in ways that look like application bugs —
# "Could not start Authentication Emulator, port taken", or worse, a dev server
# that answers on 8086 while serving code from another checkout.
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

# Named ports for the waits below. Same block as the PORTS sweep list, and
# `functions/test/unit/emulatorPorts.test.ts` fails if this file mentions any of
# the old shared defaults — which is how a stale `wait_for` here went unnoticed
# long enough to break `dev.sh` after the port move.
FIRESTORE_PORT=61200
WEB_PORT=61210

PORTS=(61200 61201 61202 61203 61204 61205 61206 61207 61210 8081 10882)
LABELS=("firestore" "fs-ws" "auth" "functions" "ui" "hub" "logging" "storage" "web" "metro" "idb")

# The iOS simulator to drive. A name, not a UDID, so it survives a wiped device
# set; override for a different size without editing this file.
IOS_SIM="${SK_IOS_SIM:-iPhone 17 Pro}"
# No `.debug` suffix on iOS, unlike Android: the simulator build installs under
# the same bundle id as the App Store build, because they never coexist.
IOS_BUNDLE_ID="com.sabeelinstitute.kanban"

status() {
  local any=0
  for i in "${!PORTS[@]}"; do
    local p="${PORTS[$i]}"
    local pid
    pid=$(lsof -ti:"$p" -sTCP:LISTEN 2>/dev/null | head -1)
    if [ -n "$pid" ]; then
      any=1
      printf '  %-12s %-6s pid %-8s %s\n' "${LABELS[$i]}" "$p" "$pid" \
        "$(ps -o args= -p "$pid" 2>/dev/null | cut -c1-70)"
    fi
  done
  if [ "$any" = 0 ]; then echo "  (nothing running)"; fi
  return 0
}

stop() {
  for p in "${PORTS[@]}"; do
    # `ss`, not `lsof`: lsof is absent from a non-interactive shell without the
    # toolchain env sourced, and a missing lsof makes this loop a silent no-op
    # that always reports the port free.
    for pid in $(ss -lptn "sport = :$p" 2>/dev/null | grep -oP 'pid=\K[0-9]+' | sort -u); do
      kill -9 "$pid" 2>/dev/null && echo "  freed $p (pid $pid)"
    done
  done
  # NO `pkill -f` for "firebase emulators" or "expo start". Those patterns match
  # a SIBLING checkout's processes — three Sabeel repos share this machine — and
  # they also match this script's own command line and the agent shell that
  # spawned it, which exits 144 mid-run. The per-port loop above is the whole
  # cleanup: it touches only ports this checkout owns.
  pkill -9 -f "idb_companion" 2>/dev/null
  sleep 3
  # Verify rather than assume: a kill that silently failed is how a "cleared"
  # port ends up serving the previous session's code.
  local left=""
  for p in "${PORTS[@]}"; do
    lsof -ti:"$p" -sTCP:LISTEN >/dev/null 2>&1 && left="$left $p"
  done
  if [ -n "$left" ]; then
    echo "  STILL HELD:$left — investigate before starting anything" >&2
    return 1
  fi
  echo "  all ports clear"
}

wait_for() { # wait_for <url> <label>
  for _ in $(seq 1 60); do
    curl -sf -o /dev/null "$1" && { echo "  $2 up"; return 0; }
    sleep 3
  done
  echo "  $2 NEVER CAME UP" >&2; return 1
}

# Wait until the AUTH TRIGGER is registered, not merely until a port answers.
#
# This is load-bearing, and its absence cost two debugging sessions. Firestore
# comes up seconds before the functions emulator finishes loading, so seeding as
# soon as 8080 answers races `onUserCreate`. A sign-in that lands in that window
# creates an auth account with NO user doc — and the app reads "auth account,
# no profile" as a rejected non-org address and shows **Wrong account** forever.
# Nothing looks broken: the emulators are up, the seed just "times out waiting
# for New board", and re-running cannot fix it because onCreate never fires
# twice for the same account.
wait_for_auth_trigger() {
  for _ in $(seq 1 60); do
    grep -q 'onUserCreate.*auth function initialized' /tmp/sk-emulators.log 2>/dev/null \
      && { echo "  auth trigger registered"; return 0; }
    sleep 3
  done
  echo "  AUTH TRIGGER NEVER REGISTERED — seeding now would strand the account" >&2
  return 1
}

case "${1:-status}" in
  status) echo "Ports:"; status ;;
  stop)   echo "Stopping:"; stop ;;
  web)
    echo "Stopping:"; stop || exit 1
    # nohup + disown: these must outlive this script, and a backgrounded child
    # that dies with its parent is a whole class of "it was running a second ago".
    nohup npm run emulators   >/tmp/sk-emulators.log 2>&1 & disown
    nohup npm run dev:web     >/tmp/sk-web.log       2>&1 & disown
    wait_for "http://127.0.0.1:${FIRESTORE_PORT}/" firestore || exit 1
    wait_for "http://127.0.0.1:${WEB_PORT}/" web       || exit 1
    wait_for_auth_trigger || exit 1
    npm run seed
    echo "Ready: http://127.0.0.1:${WEB_PORT}  (logs: /tmp/sk-emulators.log /tmp/sk-web.log)"
    ;;
  android)
    echo "Stopping:"; stop || exit 1
    nohup npm run emulators >/tmp/sk-emulators.log 2>&1 & disown
    wait_for "http://127.0.0.1:${FIRESTORE_PORT}/" firestore || exit 1
    wait_for_auth_trigger || exit 1
    ( cd app && nohup env EXPO_PUBLIC_USE_EMULATORS=1 \
        npx expo start --dev-client --port 8081 >/tmp/sk-metro.log 2>&1 & disown )
    for _ in $(seq 1 40); do ss -ltn 2>/dev/null | grep -q ':8081' && break; sleep 3; done
    echo "Metro on 8081 (log: /tmp/sk-metro.log). Launch the installed dev build."
    ;;
  ios)
    echo "Stopping:"; stop || exit 1
    # The web server is not optional here even though nothing iOS uses it:
    # `seed-dev.mjs` seeds by DRIVING the web app in a browser, so no web server
    # means no seed, and the simulator comes up signed in to an empty project.
    nohup npm run emulators >/tmp/sk-emulators.log 2>&1 & disown
    nohup npm run dev:web   >/tmp/sk-web.log       2>&1 & disown
    wait_for "http://127.0.0.1:${FIRESTORE_PORT}/" firestore || exit 1
    wait_for "http://127.0.0.1:${WEB_PORT}/" web       || exit 1
    wait_for_auth_trigger || exit 1
    npm run seed || exit 1

    ( cd app && nohup env EXPO_PUBLIC_USE_EMULATORS=1 \
        npx expo start --port 8081 >/tmp/sk-metro.log 2>&1 & disown )
    for _ in $(seq 1 40); do lsof -ti:8081 -sTCP:LISTEN >/dev/null 2>&1 && break; sleep 3; done

    # Ask the STATE, rather than inferring it from bootstatus's exit code.
    # `bootstatus || boot` looks equivalent and is not: bootstatus also fails
    # when it is interrupted, and the fallback then tries to boot a device that
    # is already up, which errors with "Unable to boot device in current state:
    # Booted" and stops the script for no reason.
    if ! xcrun simctl list devices | grep -q "$IOS_SIM (.*) (Booted)"; then
      xcrun simctl boot "$IOS_SIM" || exit 1
    fi
    xcrun simctl bootstatus "$IOS_SIM" -b >/dev/null 2>&1 || true

    if [ "${2:-}" = "--build" ] \
       || ! xcrun simctl get_app_container "$IOS_SIM" "$IOS_BUNDLE_ID" >/dev/null 2>&1; then
      echo "Building for the simulator (first run takes a while)..."
      # `|| true`: expo run:ios exits 1 on a PERFECTLY GOOD build. Its last act is
      # `ensureSimulatorAppRunning`, which shells out to osascript to raise the
      # Simulator window, and AppleScript automation is not permitted from a
      # non-GUI shell. The app is compiled, signed and installed by then.
      ( cd app && EXPO_PUBLIC_USE_EMULATORS=1 npx expo run:ios --device "$IOS_SIM" ) || true
      # So verify the INSTALL, never that exit code.
      xcrun simctl get_app_container "$IOS_SIM" "$IOS_BUNDLE_ID" >/dev/null 2>&1 || {
        echo "  build did NOT install $IOS_BUNDLE_ID — read the error above" >&2; exit 1; }
    fi

    # Sign the app OUT before launching, by clearing its data container.
    #
    # Every run above wipes the emulators and re-seeds, so each seed mints NEW
    # uids. But the app persists its Firebase session in AsyncStorage — on
    # purpose, or a restart would sign you out (app/src/firebase.ts) — and that
    # persistence SURVIVES the backend being wiped. What is left is an auth
    # session whose uid has no user doc, which the app correctly reads as an
    # account outside the org and shows as **Wrong account**, with only a Sign
    # out button. It looks like the domain check is broken. It is not: the client
    # is simply older than the backend.
    xcrun simctl terminate "$IOS_SIM" "$IOS_BUNDLE_ID" >/dev/null 2>&1 || true
    APP_DATA="$(xcrun simctl get_app_container "$IOS_SIM" "$IOS_BUNDLE_ID" data 2>/dev/null || true)"
    # `:?` so an empty path can never turn this into `rm -rf /Documents`.
    if [ -n "$APP_DATA" ] && [ -d "$APP_DATA" ]; then
      rm -rf "${APP_DATA:?}/Documents" "${APP_DATA:?}/Library"
    fi

    # Launch through simctl rather than letting expo do it, for the same reason.
    xcrun simctl launch "$IOS_SIM" "$IOS_BUNDLE_ID" >/dev/null || exit 1
    open -a Simulator 2>/dev/null || true
    echo "Ready on $IOS_SIM. Tap 'faisal' on the dev sign-in row (already an admin)."
    echo "  logs: /tmp/sk-emulators.log /tmp/sk-web.log /tmp/sk-metro.log"
    echo "  to script the UI: idb_companion --udid \$(xcrun simctl list devices | \\"
    echo "    grep -m1 '$IOS_SIM (' | grep -oE '[0-9A-F-]{36}')  # then: idb connect localhost <port>"
    ;;
  e2e)
    echo "Stopping:"; stop || exit 1
    exec bash scripts/e2e.sh
    ;;
  *) sed -n '2,12p' "$0"; exit 1 ;;
esac
