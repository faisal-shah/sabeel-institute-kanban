#!/usr/bin/env bash
# Publish the built Android APK for public download.
#
# The APK is a GitHub RELEASE ASSET on the public pages repo — NEVER committed to
# git. Committing binaries per release is what bloated the pages history and had
# to be rewritten out (see CLAUDE.md "Publishing the APK"). This script is the
# only supported way to publish, and it ends with a guardrail that FAILS if a
# binary ever lands in the pages history again.
#
# The asset lives on a fixed rolling tag (kanban-latest) and is replaced each
# build, so the download URL on the site never changes — only the version label
# on the page does.
#
#   scripts/publish-apk.sh [path/to/arm64-release.apk]
#   scripts/publish-apk.sh --check      # run every gate, publish nothing
#
# ALWAYS use --check to test the script itself. Without it the first thing that
# happens after the gates pass is an upload to the PUBLIC rolling download.
#
# It ALSO cuts the versioned GitHub Release on the app's OWN repo (all four ABI
# splits + notes from the deploy log) — the changelog/archive convention that
# lapsed after v0.1.10. A Release ASSET is not a git blob, so this does not bloat
# history the way a committed binary did; the guardrail above is about git blobs.
set -euo pipefail
cd "$(dirname "$0")/.."

# UN-RETIRED 2026-08-03, for one job Play cannot do.
#
# Android ships to the team through Google Play internal testing. But the
# developer needs to test a release build BEFORE the testers receive it, and
# from a phone, away from this machine. Play offers exactly one feature for
# that — internal app sharing — and it refuses this app: it requires the app to
# have been PUBLISHED, and internal-testing releases do not count. The app is
# still a Draft. See docs/DEPLOY.md.
#
# So this channel is the developer's pre-release route, not a second channel for
# the team. Play remains where testers get builds.
#
# WHAT CHANGED SINCE IT WAS RETIRED, and why publishing here is safe now:
# the frozen asset was the last DEBUG-signed build, and replacing it with a
# properly signed one meant anyone who had installed it could not update —
# Android refuses an install whose signature does not match, with only "App not
# installed" to explain it. That happened once, for 59 seconds. The team has
# since moved to Play, so the population still holding a sideloaded build is the
# developer, who knows to uninstall first.
#
# THE SIGNATURE RULE STILL APPLIES, and always will: an APK from here is signed
# with the UPLOAD key, while a Play install is signed with GOOGLE'S app signing
# key. They cannot replace one another in either direction. Uninstall first.
# Nothing is lost — all state is in Firestore.

REPO="faisal-shah/faisal-shah.github.io"
APP_REPO="faisal-shah/sabeel-institute-kanban"
TAG="kanban-latest"
ASSET="sabeel-kanban-arm64-v8a.apk"
# Pull --check out of the arguments FIRST, so it is never mistaken for the APK
# path. Order matters: the APK default is assigned from $1 below.
CHECK_ONLY="${SK_CHECK:-0}"
args=()
for a in "$@"; do
  if [ "$a" = "--check" ]; then CHECK_ONLY=1; else args+=("$a"); fi
done
set -- ${args[@]+"${args[@]}"}

APK="${1:-app/android/app/build/outputs/apk/release/app-arm64-v8a-release.apk}"
PAGES_DIR="${SK_PAGES_DIR:-../faisal-shah.github.io}"

[ -f "$APK" ] || { echo "APK not found: $APK — build a release first." >&2; exit 1; }
# Refuse to publish a version that would be illegal on a store. This is the last
# gate before a tag and a public download exist, and both are awkward to retract.
node scripts/check-version.mjs
VERSION="$(node -p "require('./app/app.json').expo.version")"

# Refuse to publish a DEBUG-SIGNED build.
#
# `release { signingConfig signingConfigs.debug }` was the scaffold default and
# it survived into production: every build up to v0.7.4 went out signed with the
# debug keystore that is committed to this PUBLIC repo, so anyone holding a
# clone could sign an update Android would accept as this app. Nothing caught it
# because a debug-signed APK installs and runs exactly like a real one — the
# signature is the only difference, and nobody looks at it.
#
# Checked here rather than in Gradle because this is the last point before a
# public download exists.
apksigner=""
for cand in "${ANDROID_HOME:-$HOME/opt/Android/Sdk}"/build-tools/*/apksigner; do
  [ -x "$cand" ] && apksigner="$cand"
done
if [ -z "$apksigner" ]; then
  echo "apksigner not found — cannot verify the signature of what is about to be published." >&2
  echo "Set ANDROID_HOME, or install build-tools." >&2
  exit 1
fi
signer_dn="$("$apksigner" verify --print-certs "$APK" | sed -n 's/^Signer #1 certificate DN: //p')"
case "$signer_dn" in
  *"CN=Android Debug"*)
    echo "REFUSING TO PUBLISH: $APK is signed with the DEBUG key ($signer_dn)." >&2
    echo "Create a real upload keystore and app/android/keystore.properties," >&2
    echo "then rebuild. See TODO.md section F." >&2
    exit 1 ;;
esac
echo "signature ok (${signer_dn})"

# --check runs every gate above and stops before anything leaves this machine.
#
# It exists because there was no way to ask "would this publish?" without
# publishing: running the script to watch the signature gate work uploaded a
# newly-signed APK over the rolling asset, which existing installs cannot
# update. The gates are exactly the part worth exercising, so make exercising
# them free.
if [ "$CHECK_ONLY" = "1" ]; then
  echo "--check: all gates passed; nothing published."
  exit 0
fi

# 1) Replace the rolling asset (constant URL across builds).
tmp="$(mktemp -d)/$ASSET"; cp "$APK" "$tmp"
gh release upload "$TAG" "$tmp" --clobber --repo "$REPO"
echo "Uploaded $ASSET to $REPO ($TAG)"

# 2) Bump the version label and the published time — TEXT ONLY, no binary.
#
# The time matters more than it looks: the download URL is a ROLLING asset, so
# the page and the link look identical before and after a publish. Without a
# timestamp there is no way for anyone — including us — to tell whether the file
# behind that button is the build we just cut or last month's. "Did it actually
# publish?" is otherwise unanswerable from the page.
#
# Org timezone, PINNED rather than machine-local: a build cut from a laptop in
# another timezone must not silently change what the label means. The zone is
# spelled out because a bare "26/07 19:42" is ambiguous to a reader.
#
# Format and zone match the sibling time-tracker's page exactly, so the two
# download pages on the shared site read the same way. Both are pinned; do not
# "simplify" either back to a bare `date`.
PUBLISHED="$(TZ=America/Chicago date '+%-d %B %Y, %-I:%M %p %Z')"
if [ -d "$PAGES_DIR/.git" ]; then
  sed -i -E "s#(Current build: <strong>)v[0-9][^<]*#\\1v${VERSION}#" \
    "$PAGES_DIR/sabeel-kanban/index.html"
  sed -i -E "s#(<span class=\"published\">)[^<]*#\\1${PUBLISHED}#" \
    "$PAGES_DIR/sabeel-kanban/index.html"
  # Both labels must actually be present, or the page silently keeps advertising
  # an older build while the asset underneath it changes.
  grep -q "Current build: <strong>v${VERSION}</strong>" \
    "$PAGES_DIR/sabeel-kanban/index.html" \
    || { echo "FAILED to update the version label on the download page" >&2; exit 1; }
  grep -q "<span class=\"published\">${PUBLISHED}</span>" \
    "$PAGES_DIR/sabeel-kanban/index.html" \
    || { echo "FAILED to update the published time on the download page" >&2; exit 1; }
  # The SIZE on the button, which drifted silently for four releases: the page
  # advertised 31 MB while the asset had grown to 37. Nobody edits a number they
  # are not looking at, so the script owns it now.
  SIZE_MB="$(( ( $(stat -c %s "$APK") + 524288 ) / 1048576 ))"
  sed -i -E "s#(Download for Android \()[0-9]+(&nbsp;MB\))#\1${SIZE_MB}\2#" \
    "$PAGES_DIR/sabeel-kanban/index.html"
  grep -q "Download for Android (${SIZE_MB}&nbsp;MB)" \
    "$PAGES_DIR/sabeel-kanban/index.html" \
    || { echo "FAILED to update the download size on the page" >&2; exit 1; }
  echo "Page labelled v${VERSION}, ${SIZE_MB} MB, published ${PUBLISHED}"
  git -C "$PAGES_DIR" add sabeel-kanban/index.html
  git -C "$PAGES_DIR" commit -q -m "Kanban page: v${VERSION} (${PUBLISHED})" \
    && git -C "$PAGES_DIR" push -q \
    || echo "(page unchanged)"
else
  echo "NOTE: pages repo not at $PAGES_DIR — set SK_PAGES_DIR to update the version label." >&2
fi

# 3) GUARDRAIL: the pages repo must never hold an apk blob. This is the check
#    that was missing when binaries piled up — verify the RESULT, not the action.
if [ -d "$PAGES_DIR/.git" ]; then
  n="$(git -C "$PAGES_DIR" rev-list --all --objects | grep -c '\.apk$' || true)"
  [ "$n" -eq 0 ] || {
    echo "GUARDRAIL FAILED: $n apk blob(s) in pages history — a binary was committed." >&2
    exit 1
  }
fi

# 4) Cut the versioned Release on the APP repo (per-version changelog + archived
#    ABI splits). Idempotent: updates in place if v$VERSION already exists.
RELDIR="$(dirname "$APK")"
astage="$(mktemp -d)"
assets=()
for abi in arm64-v8a armeabi-v7a universal x86_64; do
  src="$RELDIR/app-${abi}-release.apk"
  [ -f "$src" ] || { echo "missing ABI split $src — build all four (npm run build:apk)" >&2; exit 1; }
  cp "$src" "$astage/sabeel-kanban-${abi}.apk"
  assets+=("$astage/sabeel-kanban-${abi}.apk")
done
title="$(node scripts/deploy-notes.mjs "$VERSION" --title 2>/dev/null || echo "v${VERSION}")"
node scripts/deploy-notes.mjs "$VERSION" > "$astage/notes.md" 2>/dev/null || echo "Release v${VERSION}." > "$astage/notes.md"
if gh release view "v$VERSION" --repo "$APP_REPO" >/dev/null 2>&1; then
  gh release edit "v$VERSION" --repo "$APP_REPO" --title "$title" --notes-file "$astage/notes.md"
  gh release upload "v$VERSION" "${assets[@]}" --clobber --repo "$APP_REPO"
else
  gh release create "v$VERSION" "${assets[@]}" --repo "$APP_REPO" \
    --title "$title" --notes-file "$astage/notes.md" --target "$(git rev-parse HEAD)"
fi
echo "Cut $APP_REPO release v$VERSION (${#assets[@]} ABI splits)."

echo "Published kanban v${VERSION}."
