#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

# Web end-to-end against the emulators.
#
# Drives the Expo web DEV server, not an exported bundle: `expo export` sets
# __DEV__ false, which correctly strips the emulator dev sign-in this flow needs
# to drive. The script also builds the PRODUCTION bundle and asserts the dev row
# is absent from it — so the safety property is tested, not assumed.

if [ -n "${SK_JDK21_HOME:-}" ]; then
  export JAVA_HOME="$SK_JDK21_HOME"
elif [ -d "$HOME/opt/jdk-21" ]; then
  export JAVA_HOME="$HOME/opt/jdk-21"
fi
[ -n "${JAVA_HOME:-}" ] && export PATH="$JAVA_HOME/bin:$PATH"

WEB_PORT=8086
export E2E_BASE="http://127.0.0.1:${WEB_PORT}/"

npm run build -w @sabeel/shared
npm run build -w functions

echo "Building production web bundle (for the dev-row absence check)…"
( cd app && npx expo export --platform web --output-dir dist-web --clear >/dev/null )

cleanup() {
  [ -n "${WEB_PID:-}" ] && kill "$WEB_PID" 2>/dev/null || true
}
trap cleanup EXIT

echo "Starting Expo web dev server on ${WEB_PORT}…"
( cd app && CI=1 EXPO_PUBLIC_USE_EMULATORS=1 \
    npx expo start --web --port "$WEB_PORT" >/tmp/expo-web-e2e.log 2>&1 ) &
WEB_PID=$!

# Wait for the dev server to answer before handing over to Playwright.
for _ in $(seq 1 60); do
  if curl -sf -o /dev/null "http://127.0.0.1:${WEB_PORT}/"; then break; fi
  sleep 2
done

exec firebase emulators:exec \
  --project demo-sabeel-kanban \
  --only firestore,auth,functions \
  "node scripts/web-e2e.mjs"
