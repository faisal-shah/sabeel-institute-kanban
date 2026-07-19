#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

# Long-running Firebase emulators for local development.
#
# Functions are built first, because the functions emulator runs the BUILT
# bundle — without this you get stale (or missing) triggers and the symptom is a
# user who signs in and never gets provisioned.

if [ -n "${SK_JDK21_HOME:-}" ]; then
  export JAVA_HOME="$SK_JDK21_HOME"
elif [ -d "$HOME/opt/jdk-21" ]; then
  export JAVA_HOME="$HOME/opt/jdk-21"
fi
[ -n "${JAVA_HOME:-}" ] && export PATH="$JAVA_HOME/bin:$PATH"

npm run build -w @sabeel/shared
npm run build -w functions

echo
echo "Emulator UI → http://127.0.0.1:4000"
echo "Data is discarded when you stop these. Ctrl-C to quit."
echo

exec firebase emulators:start \
  --project demo-sabeel-kanban \
  --only firestore,auth,functions
