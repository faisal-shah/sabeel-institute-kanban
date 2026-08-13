#!/usr/bin/env bash
# Source me. Exports the build-machine values from app/.env.sentry-build-plugin.
#
#   . scripts/load-build-env.sh
#
# WHY THIS EXISTS. Three values have to reach two very different places:
# `sentry.gradle` on Android and `xcodebuild` on the Mac. Both read the process
# environment, and neither reads `app/.env.local` — that file is Expo's, for
# inlining EXPO_PUBLIC_* into the JS bundle, and sentry-cli never sees it.
#
# Keeping them in one gitignored file instead of shell exports means they
# survive a new terminal, stay out of shell history, and cannot be committed by
# accident — which matters because this repo is PUBLIC.
#
# `sentry.gradle` finds the same file by itself (it sets SENTRY_DOTENV_PATH when
# it exists), but that is not enough on its own: the gate in
# app/android/app/build.gradle asks whether SENTRY_AUTH_TOKEN is in the
# ENVIRONMENT before it applies the script at all. So the file has to be loaded
# before Gradle starts, which is this.
#
# Parsed rather than `source`d: a dotenv file is not shell, and sourcing one
# executes whatever is in it. Values keep any `=` they contain; comments and
# blank lines are skipped.
_sk_env_file="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/app/.env.sentry-build-plugin"

if [ -f "$_sk_env_file" ]; then
  while IFS='=' read -r _sk_key _sk_val || [ -n "$_sk_key" ]; do
    _sk_key="${_sk_key#"${_sk_key%%[![:space:]]*}"}"   # ltrim
    case "$_sk_key" in '' | '#'*) continue ;; esac
    _sk_val="${_sk_val%$'\r'}"
    # A BLANK LINE IN THE FILE IS NOT A VALUE, and an existing environment
    # variable WINS. Both directions were bugs when this was written the obvious
    # way: the file ships with empty placeholders, so an unconditional export
    # overwrote a perfectly good `IOS_TEAM_ID=… bash scripts/build-ios.sh` with
    # nothing, and the script then reported the variable unset. It also matters
    # for CI, where the values arrive as real environment secrets and there is no
    # file at all.
    [ -n "$_sk_val" ] || continue
    [ -z "${!_sk_key:-}" ] || continue
    export "$_sk_key=$_sk_val"
  done < "$_sk_env_file"
  unset _sk_key _sk_val
fi
unset _sk_env_file
