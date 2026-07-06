#!/usr/bin/env bash
#
# repair-electron.sh — heal the "husk electron" that pnpm + macOS leave behind.
#
# WHY THIS EXISTS
# ---------------
# On macOS under pnpm, electron's install.js postinstall regularly EXITS 0
# WITHOUT extracting the app bundle. Every fresh clone/worktree then has a
# `dist/` containing only LICENSES.chromium.html — no Electron.app, no
# path.txt — and e2e fails with a misleading ENOENT / "missing binary".
# This script is the institutional memory of ~15 sessions of that pain
# (AI-IMP-006/008/019/020/021/022/061/069/070/071/072/075/080/081). It is
# idempotent: a healthy tree prints one OK line and exits fast.
#
# THE FIVE LANDMINES (each is defended below; do not "simplify" them away)
#
#   (1) electron's install.js exits 0 WITHOUT extracting under macOS+pnpm.
#       NEVER trust its exit code — verify the real binary exists AND is
#       executable at dist/Electron.app/Contents/MacOS/Electron.
#   (2) When repairing, `rm -rf` the husk dist FIRST. Extracting/copying
#       over a populated dist nests it (the classic dist/dist), which then
#       resolves to a non-existent binary path.
#   (3) path.txt MUST be written with `printf '%s'`, never `echo`. echo's
#       trailing newline makes electron spawn a path with a stray \n →
#       ENOENT that reads exactly like a missing binary.
#   (4) install.js's bundled extractor (extract-zip) is the thing that
#       silently no-ops. Do NOT rely on it — extract the cached zip
#       ourselves with `ditto` (macOS-native, preserves the executable
#       bit and app-bundle symlinks). `unzip` is the fallback.
#   (5) The electron package dir the APP RESOLVES can differ from any
#       hardcoded pnpm-store path (version bumps, store relocation).
#       Resolve it via `require.resolve('electron/package.json')` run
#       from apps/desktop — the same resolution the app itself uses.
#
# Scope: macOS only. The husk bug is macOS+pnpm specific; Linux/Windows
# install electron normally, so there is nothing here to repair and we do
# NOT guess an extraction path for them (see AI-IMP-111 Out of Scope).
#
set -euo pipefail

log() { printf 'repair-electron: %s\n' "$1"; }
die() { printf 'repair-electron: ERROR: %s\n' "$1" >&2; exit 1; }

# --- platform gate -----------------------------------------------------
# Direct invocation on a non-mac is a clear failure (we own no repair path
# there). The e2e guard only calls us on darwin, so CI-linux never hits this.
if [ "$(uname -s)" != "Darwin" ]; then
  die "only macOS is supported (the husk bug is macOS+pnpm specific); nothing to repair here"
fi

# --- locate the repo + apps/desktop ------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DESKTOP_DIR="$REPO_ROOT/apps/desktop"
[ -d "$DESKTOP_DIR" ] || die "apps/desktop not found at $DESKTOP_DIR"

# --- LANDMINE 5: resolve the electron dir the app actually resolves ----
# require.resolve from apps/desktop mirrors the app's own module resolution,
# so we heal the exact package it will load — not a guessed store path.
ELECTRON_PKG_JSON="$(cd "$DESKTOP_DIR" && node -p "require.resolve('electron/package.json')" 2>/dev/null)" \
  || die "cannot resolve electron from apps/desktop — run 'pnpm install' first"
ELECTRON_DIR="$(dirname "$ELECTRON_PKG_JSON")"
VERSION="$(node -p "require('$ELECTRON_PKG_JSON').version")"

DIST="$ELECTRON_DIR/dist"
PLATFORM_PATH="Electron.app/Contents/MacOS/Electron"   # electron's darwin path.txt value
BIN="$DIST/$PLATFORM_PATH"
PATH_TXT="$ELECTRON_DIR/path.txt"
ARCH="$(node -p "process.arch")"                       # arm64 | x64

# --- health check (the idempotent fast path) ---------------------------
# LANDMINE 1: presence of dist/ is NOT enough — the binary must exist and
#             be executable. LANDMINE 3: path.txt must be EXACTLY the
#             platform path with NO trailing newline, so we check the byte
#             length too ($(cat) would silently strip a stray newline).
is_healthy() {
  [ -x "$BIN" ] || return 1
  [ -f "$DIST/version" ] && [ "$(cat "$DIST/version")" = "$VERSION" ] || return 1
  [ -f "$PATH_TXT" ] || return 1
  [ "$(cat "$PATH_TXT")" = "$PLATFORM_PATH" ] || return 1
  [ "$(wc -c < "$PATH_TXT" | tr -d ' ')" -eq "${#PLATFORM_PATH}" ] || return 1  # no trailing newline
  return 0
}

if is_healthy; then
  log "OK — electron $VERSION healthy at $ELECTRON_DIR"
  exit 0
fi

log "husk detected (electron $VERSION, $ARCH) — repairing $DIST"

# --- find (or download) the cached zip ---------------------------------
# electron caches at ~/Library/Caches/electron unless overridden.
CACHE_ROOT="${ELECTRON_CACHE:-${electron_config_cache:-$HOME/Library/Caches/electron}}"
ZIP_NAME="electron-v${VERSION}-darwin-${ARCH}.zip"

find_zip() {
  # Cache is content-addressed by hash subdir, so search by filename.
  find "$CACHE_ROOT" -name "$ZIP_NAME" -type f 2>/dev/null | head -n1
}

ZIP="$(find_zip)"
if [ -z "$ZIP" ]; then
  # No cached zip: run install.js ONLY to make it download into the cache.
  # LANDMINE 1: we ignore whether it "succeeded" and re-verify via the zip.
  log "no cached $ZIP_NAME — running install.js to download"
  (cd "$ELECTRON_DIR" && node install.js) || true
  ZIP="$(find_zip)"
  [ -n "$ZIP" ] || die "electron zip still missing after download attempt ($ZIP_NAME under $CACHE_ROOT)"
fi
log "extracting from $ZIP"

# --- LANDMINE 2: remove the husk dist FIRST, then extract cleanly ------
# (extracting over a populated dir nests it → dist/dist → dead path.)
rm -rf "$DIST"
mkdir -p "$DIST"

# --- LANDMINE 4: extract with ditto, NOT install.js's extractor --------
# ditto is macOS-native and preserves the exec bit + app-bundle symlinks.
if command -v ditto >/dev/null 2>&1; then
  ditto -x -k "$ZIP" "$DIST"
elif command -v unzip >/dev/null 2>&1; then
  unzip -q -o "$ZIP" -d "$DIST"
else
  die "neither ditto nor unzip available to extract $ZIP"
fi

# Older electron zips ship electron.d.ts inside dist; install.js hoists it
# to the package root. Mirror that so tooling that imports the d.ts works.
if [ -f "$DIST/electron.d.ts" ]; then
  mv -f "$DIST/electron.d.ts" "$ELECTRON_DIR/electron.d.ts"
fi

# --- LANDMINE 3: write path.txt with printf (NO trailing newline) ------
printf '%s' "$PLATFORM_PATH" > "$PATH_TXT"

# --- final verification (trust nothing but the filesystem) -------------
is_healthy || die "repair completed but tree still unhealthy — inspect $DIST and $PATH_TXT"

log "OK — repaired electron $VERSION at $ELECTRON_DIR"
