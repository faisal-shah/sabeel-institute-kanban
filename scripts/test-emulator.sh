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

exec firebase emulators:exec \
  --project demo-sabeel-kanban \
  --only firestore,auth \
  "npm run test:integration -w functions"
