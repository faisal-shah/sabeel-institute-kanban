#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

# Long-running Firebase emulators for local development.
#
# Functions are built first, because the functions emulator runs the BUILT
# bundle — without this you get stale (or missing) triggers and the symptom is a
# user who signs in and never gets provisioned.

# shellcheck source=scripts/jdk21.sh
. "$(dirname "$0")/jdk21.sh"

npm run build -w @sabeel/shared
npm run build -w functions

echo
echo "Emulator UI → http://127.0.0.1:61204"
echo "Data is discarded when you stop these. Ctrl-C to quit."
echo

exec firebase emulators:start \
  --project demo-sabeel-kanban \
  --only firestore,auth,functions,storage
