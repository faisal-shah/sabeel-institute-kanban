#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

# Web end-to-end against the emulators.
#
# Drives the Expo web DEV server, not an exported bundle: `expo export` sets
# __DEV__ false, which correctly strips the emulator dev sign-in this flow needs
# to drive. The script also builds the PRODUCTION bundle and asserts the dev row
# is absent from it — so the safety property is tested, not assumed.

# shellcheck source=scripts/jdk21.sh
. "$(dirname "$0")/jdk21.sh"

WEB_PORT=61210
export E2E_BASE="http://127.0.0.1:${WEB_PORT}/"

npm run build -w @sabeel/shared
npm run build -w functions

echo "Building production web bundle (for the dev-row absence check)…"
( cd app && npx expo export --platform web --output-dir dist-web --clear >/dev/null )

# Kill anything already on the port. A LEFTOVER dev server from a previous run
# is the nastiest failure mode here: the new `expo start` cannot bind, exits
# quietly, and the readiness check below gets a cheerful 200 from the stale
# process — so the whole suite runs against OLD code and reports mystery
# failures for changes you just made. Cost a debugging round on 2026-07-19.
for p in $(lsof -ti:"$WEB_PORT" -sTCP:LISTEN 2>/dev/null); do
  echo "killing stale dev server on ${WEB_PORT} (pid $p)"
  kill "$p" 2>/dev/null || true
done
sleep 2

cleanup() {
  [ -n "${WEB_PID:-}" ] && kill "$WEB_PID" 2>/dev/null || true
  for p in $(lsof -ti:"$WEB_PORT" -sTCP:LISTEN 2>/dev/null); do
    kill "$p" 2>/dev/null || true
  done
}
trap cleanup EXIT

echo "Starting Expo web dev server on ${WEB_PORT}…"
# --clear because Metro will otherwise serve a bundle built under different
# EXPO_PUBLIC_* values (see docs/INHERITED-STACK.md lesson 4).
#
# EXPO_PUBLIC_FCM_VAPID_KEY is set to a FAKE value on purpose, and only here.
#
# `canRequestPush()` in notify.web.ts needs nothing but a truthy key, and
# without one it reports 'unsupported' whatever the browser would actually
# permit — so the notifications panel had exactly one reachable state in CI, and
# the check that it "says exactly one thing about this device" could never see
# the other three. The permission states are the point of that panel.
#
# The value is deliberately NOT shaped like a VAPID key: `check-web-push.mjs`
# looks for 87 base64url characters, so if this ever reached an exported bundle
# the release gate would fail with "no VAPID key" rather than pass on a fake.
# Nothing here can reach `getToken` in any case — `claimToken` returns on
# USE_EMULATORS before the key is ever used.
#
# Set on THIS LINE, never exported: the production export above must stay
# keyless, which is what makes the dev-row and gate checks mean anything.
( cd app && CI=1 EXPO_PUBLIC_USE_EMULATORS=1 \
    EXPO_PUBLIC_FCM_VAPID_KEY=e2e-fake-vapid-key-not-a-real-one \
    npx expo start --web --port "$WEB_PORT" --clear >/tmp/sk-web-e2e.log 2>&1 ) &
WEB_PID=$!

# Wait for the dev server. The pre-kill above means whatever answers on this port
# is the server we just started — but check the log for the "port in use" case
# explicitly, because that is the failure that silently serves stale code.
ready=""
for _ in $(seq 1 90); do
  if grep -qi "is being used by another process" /tmp/sk-web-e2e.log 2>/dev/null; then
    echo "Another process grabbed port ${WEB_PORT}; refusing to test stale code." >&2
    exit 1
  fi
  if curl -sf -o /dev/null "http://127.0.0.1:${WEB_PORT}/"; then
    ready=1
    break
  fi
  sleep 2
done
if [ -z "$ready" ]; then
  echo "Expo web dev server never became ready — see /tmp/sk-web-e2e.log" >&2
  tail -25 /tmp/sk-web-e2e.log >&2 || true
  exit 1
fi

# Which suite to drive. Defaults to the full flow; pass a script to run a
# focused one against the same stack (e.g. scripts/attachments-e2e.mjs).
SUITE="${1:-scripts/web-e2e.mjs}"

exec firebase emulators:exec \
  --project demo-sabeel-kanban \
  --only firestore,auth,functions,storage \
  "node ${SUITE}"
