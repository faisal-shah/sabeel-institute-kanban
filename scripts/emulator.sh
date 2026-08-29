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

# Pick the CPU acceleration flags for THIS host, per run.
#
# `-accel auto` (the default) does NOT fall back to software for an x86_64
# image — it REFUSES, exiting at once with "x86_64 emulation currently requires
# hardware acceleration!". Only an explicit `-accel off` selects QEMU's software
# CPU (TCG). `-gpu swiftshader_indirect` is a separate knob covering the GPU
# alone, so it never stood in for this.
#
# Detected rather than hardcoded, because this repo is developed from several
# machines and most of them HAVE KVM: on those nothing changes and the emulator
# runs at full speed. Only a host without it gets the slow path, instead of an
# instant exit that reads as a broken emulator.
#
# Both accepted spellings are matched. `-accel-check` says "accel: 0" on some
# builds and "KVM (version N) is installed and usable" on others — matching only
# the first would push an ACCELERATED host onto the software path, which is the
# expensive direction to get wrong.
# Called only by the two commands that actually boot, so `list`/`shot`/`kill`
# stay quiet and cost nothing.
accel_flags() {
  local out
  out=$(emulator -accel-check 2>&1 | tr '\n' ' ' || true)
  case "$out" in
    *"is installed and usable"*|*"accel:0"*|*"accel: 0"*) return 0 ;;
  esac
  ACCEL=(-accel off)
  echo "No CPU acceleration on this host ($out)." >&2
  echo "Falling back to software CPU (-accel off): expect several minutes to" >&2
  echo "boot and ~14 s per screencap. Input stays usable." >&2
}

ACCEL=()

case "${1:-help}" in
  headless)
    accel_flags
    exec emulator -avd "$AVD" -no-window -no-boot-anim -gpu swiftshader_indirect -no-snapshot "${ACCEL[@]}" ;;
  window)
    accel_flags
    exec emulator -avd "$AVD" -gpu host -no-snapshot "${ACCEL[@]}" ;;
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
