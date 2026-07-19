#!/usr/bin/env bash
# Android emulator helper. AVD: tb_emu — Pixel 6 (1080x2400), API 35, Google APIs
# image (Play services present, so Google Sign-In works).
#
# There are NO physical devices on this machine — the emulator is the only way to
# verify Android, and it runs headless, so verify by screenshot:
#   adb exec-out screencap -p > shots/name.png
#
#   scripts/emulator.sh headless   # no window (agent/CI automation, software GPU)
#   scripts/emulator.sh window     # visible window for interacting at the computer
#   scripts/emulator.sh list       # show running emulators
#   scripts/emulator.sh shot NAME  # screenshot to shots/NAME.png
#   scripts/emulator.sh kill [serial]
set -euo pipefail
export ANDROID_HOME="${ANDROID_HOME:-$HOME/opt/Android/Sdk}"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"
AVD="${SK_AVD:-tb_emu}"

case "${1:-help}" in
  headless)
    exec emulator -avd "$AVD" -no-window -no-boot-anim -gpu swiftshader_indirect -no-snapshot ;;
  window)
    exec emulator -avd "$AVD" -gpu host -no-snapshot ;;
  list)
    adb devices | grep -E 'emulator-|device$' || echo "no devices" ;;
  shot)
    mkdir -p shots
    adb exec-out screencap -p > "shots/${2:-shot}.png"
    echo "wrote shots/${2:-shot}.png" ;;
  kill)
    adb -s "${2:-emulator-5554}" emu kill ;;
  *)
    echo "usage: scripts/emulator.sh {headless|window|list|shot NAME|kill [serial]}" ;;
esac
