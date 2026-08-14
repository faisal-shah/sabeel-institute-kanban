#!/usr/bin/env bash
# Resolve a working JDK 21+ for the Firebase emulators, which are Java.
#
# SOURCED by emulators.sh, test-emulator.sh and e2e.sh. It lives in one file
# because it used to live in three, and the copies covered only
# `SK_JDK21_HOME` and `~/opt/jdk-21` — so on a Mac that had neither, every
# emulator path failed identically and none of them said why. The visible
# symptom arrives several steps downstream, from firebase rather than from us:
#
#   Error: Process `java -version` has exited with code 1.
#   Please make sure Java is installed and on your system PATH.
#
# printed after "Emulator UI → http://127.0.0.1:4000" has already scrolled past,
# so it reads like the emulators started and then died.
#
# Locally JDK 17 may remain the default because Gradle wants it; this points
# ONLY the emulators at 21.
#
# Order: explicit SK_JDK21_HOME -> ~/opt/jdk-21 -> a java that already works
# (CI supplies one via setup-java) -> discovered on this machine.

sk_resolve_jdk21() {
  # `command -v java` is USELESS as a check on macOS: /usr/bin/java always
  # exists as a stub that exits 1 with "Unable to locate a Java Runtime". Only
  # actually running it proves anything.
  _sk_java_works() { java -version >/dev/null 2>&1; }

  if [ -n "${SK_JDK21_HOME:-}" ]; then
    export JAVA_HOME="$SK_JDK21_HOME"
  elif [ -d "$HOME/opt/jdk-21" ]; then
    export JAVA_HOME="$HOME/opt/jdk-21"
  elif ! _sk_java_works; then
    # Nothing configured and nothing working — look where a JDK actually tends
    # to be on a developer Mac. Homebrew's prefix is READ-ONLY to us here (it is
    # owned by another account), but reading a JDK out of it is fine.
    for _sk_cand in \
      "$(/usr/libexec/java_home -v 21 2>/dev/null)" \
      /opt/homebrew/opt/openjdk@21 \
      /usr/local/opt/openjdk@21 \
      "/Applications/Android Studio.app/Contents/jbr/Contents/Home"
    do
      if [ -n "$_sk_cand" ] && [ -x "$_sk_cand/bin/java" ]; then
        export JAVA_HOME="$_sk_cand"
        break
      fi
    done
    unset _sk_cand
  fi

  [ -n "${JAVA_HOME:-}" ] && export PATH="$JAVA_HOME/bin:$PATH"

  # Prove it, rather than trusting that a path existed.
  if ! _sk_java_works; then
    echo "No working JDK 21 found — the Firebase emulators are Java and cannot start." >&2
    echo "Looked at: SK_JDK21_HOME, ~/opt/jdk-21, /usr/libexec/java_home -v 21," >&2
    echo "           /opt/homebrew/opt/openjdk@21, Android Studio's bundled JBR." >&2
    echo "Set SK_JDK21_HOME to a JDK 21 home, or install one at ~/opt/jdk-21." >&2
    return 1
  fi
  return 0
}

sk_resolve_jdk21 || exit 1
