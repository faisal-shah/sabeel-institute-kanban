#!/usr/bin/env bash
# One entry point for the local dev loop, so nobody re-derives it under pressure.
#
#   scripts/dev.sh status     what is running, and who owns each port
#   scripts/dev.sh stop       free EVERY port this project uses
#   scripts/dev.sh web        stop, start emulators + web, seed
#   scripts/dev.sh android    stop, start emulators + Metro for the device build
#   scripts/dev.sh e2e        stop, then run the full suite (it manages its own)
#
# Why this exists: half a dozen debugging sessions were lost to a stale emulator
# or Metro holding a port, which fails in ways that look like application bugs —
# "Could not start Authentication Emulator, port taken", or worse, a dev server
# that answers on 8086 while serving code from another checkout.
set -uo pipefail
cd "$(dirname "$0")/.."

PORTS=(8080 9099 5001 4400 4401 4500 4501 9150 8086 8081)
LABELS=("firestore" "auth" "functions" "hub" "hub-alt" "logging" "logging-alt" "fs-ws" "web" "metro")

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
    for pid in $(lsof -ti:"$p" -sTCP:LISTEN 2>/dev/null); do
      kill -9 "$pid" 2>/dev/null && echo "  freed $p (pid $pid)"
    done
  done
  pkill -9 -f "firebase emulators" 2>/dev/null
  pkill -9 -f "expo start" 2>/dev/null
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

case "${1:-status}" in
  status) echo "Ports:"; status ;;
  stop)   echo "Stopping:"; stop ;;
  web)
    echo "Stopping:"; stop || exit 1
    # nohup + disown: these must outlive this script, and a backgrounded child
    # that dies with its parent is a whole class of "it was running a second ago".
    nohup npm run emulators   >/tmp/sk-emulators.log 2>&1 & disown
    nohup npm run dev:web     >/tmp/sk-web.log       2>&1 & disown
    wait_for http://127.0.0.1:8080/ firestore || exit 1
    wait_for http://127.0.0.1:8086/ web       || exit 1
    npm run seed
    echo "Ready: http://127.0.0.1:8086  (logs: /tmp/sk-emulators.log /tmp/sk-web.log)"
    ;;
  android)
    echo "Stopping:"; stop || exit 1
    nohup npm run emulators >/tmp/sk-emulators.log 2>&1 & disown
    wait_for http://127.0.0.1:8080/ firestore || exit 1
    ( cd app && nohup env EXPO_PUBLIC_USE_EMULATORS=1 \
        npx expo start --dev-client --port 8081 >/tmp/sk-metro.log 2>&1 & disown )
    for _ in $(seq 1 40); do ss -ltn 2>/dev/null | grep -q ':8081' && break; sleep 3; done
    echo "Metro on 8081 (log: /tmp/sk-metro.log). Launch the installed dev build."
    ;;
  e2e)
    echo "Stopping:"; stop || exit 1
    exec bash scripts/e2e.sh
    ;;
  *) sed -n '2,12p' "$0"; exit 1 ;;
esac
