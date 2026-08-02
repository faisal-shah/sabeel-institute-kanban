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

# THIS CHANNEL IS RETIRED (2026-08-02). Android ships through Google Play now;
# use `npm run build:aab`.
#
# The rolling download is FROZEN at v0.7.4, the last debug-signed build, because
# that is what the team already has installed. Publishing anything newer here
# would be actively harmful rather than merely obsolete: every build from now on
# is signed with the real upload key, and Android refuses to update an install
# whose signature does not match. Anyone tapping the download would get "App not
# installed" and have no idea why. That is not hypothetical — it happened once,
# for 59 seconds, and is the reason this block exists.
#
# The script is kept, working, for one job: replacing the frozen asset if it is
# ever lost. Hence an override rather than deletion.
if [ "${SK_LEGACY_APK_CHANNEL:-}" != "1" ]; then
  cat >&2 <<'EOF'
publish-apk.sh is RETIRED — Android releases go to Google Play.

  npm run build:aab     then upload at Play Console -> Internal testing

The GitHub-release download is frozen at v0.7.4 (debug-signed) because that is
what existing installs match. A newer, properly-signed APK cannot install over
it, so publishing one here breaks the download for everyone who already has the
app.

If you really are restoring the frozen asset:  SK_LEGACY_APK_CHANNEL=1 $0
EOF
  exit 1
fi

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
  echo "Page labelled v${VERSION}, published ${PUBLISHED}"
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
