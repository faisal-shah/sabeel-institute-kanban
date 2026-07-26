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
#
# It ALSO cuts the versioned GitHub Release on the app's OWN repo (all four ABI
# splits + notes from the deploy log) — the changelog/archive convention that
# lapsed after v0.1.10. A Release ASSET is not a git blob, so this does not bloat
# history the way a committed binary did; the guardrail above is about git blobs.
set -euo pipefail
cd "$(dirname "$0")/.."

REPO="faisal-shah/faisal-shah.github.io"
APP_REPO="faisal-shah/sabeel-institute-kanban"
TAG="kanban-latest"
ASSET="sabeel-kanban-arm64-v8a.apk"
APK="${1:-app/android/app/build/outputs/apk/release/app-arm64-v8a-release.apk}"
PAGES_DIR="${SK_PAGES_DIR:-../faisal-shah.github.io}"

[ -f "$APK" ] || { echo "APK not found: $APK — build a release first." >&2; exit 1; }
# Refuse to publish a version that would be illegal on a store. This is the last
# gate before a tag and a public download exist, and both are awkward to retract.
node scripts/check-version.mjs
VERSION="$(node -p "require('./app/app.json').expo.version")"

# 1) Replace the rolling asset (constant URL across builds).
tmp="$(mktemp -d)/$ASSET"; cp "$APK" "$tmp"
gh release upload "$TAG" "$tmp" --clobber --repo "$REPO"
echo "Uploaded $ASSET to $REPO ($TAG)"

# 2) Bump the version label on the download page — TEXT ONLY, no binary.
if [ -d "$PAGES_DIR/.git" ]; then
  sed -i -E "s#(Current build: <strong>)v[0-9][^<]*#\\1v${VERSION}#" \
    "$PAGES_DIR/sabeel-kanban/index.html"
  git -C "$PAGES_DIR" add sabeel-kanban/index.html
  git -C "$PAGES_DIR" commit -q -m "Kanban page: v${VERSION}" && git -C "$PAGES_DIR" push -q \
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
