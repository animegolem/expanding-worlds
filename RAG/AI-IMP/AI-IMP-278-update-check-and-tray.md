---
node_id: AI-IMP-278
tags:
  - IMP-LIST
  - Implementation
  - main-process
  - release
kanban_status: completed
depends_on: []
parent_epic:
confidence_score: 0.85
date_created: 2026-07-11
date_completed: 2026-07-11
---


# AI-IMP-278-update-check-and-tray

## Summary of Issue #1

Testing cadence is multiple tagged builds per day and both testers
install by hand from the releases page — nothing tells a running
app it's stale. Owner-ruled shape (2026-07-11): check at LAUNCH
(never polling — the app is offline-sacred), a Settings "Check for
updates" row, and a TRAY icon (Windows tray / macOS menu bar) that
signals a detected update and offers acting on it from its menu.
Hand-rolled fetch of the public GitHub releases API
(`repos/animegolem/expanding-worlds/releases/latest`, no auth);
electron-updater is deliberately NOT used while builds are
unsigned. No macOS signing warning surface (owner is the sole mac
user until the dev account lands pre-1.0).

Done means: a stale install learns it is stale at launch and shows
it quietly (tray indicator; no modal, no toast storm), Settings can
ask on demand and prints the answer inline, and the tray menu's
update row takes the user to the new build (v1: open the platform
asset's download URL in the browser; staged in-app download is a
future rung). Offline or API failure is SILENT at launch (GR-3: a
failed courtesy check is not an error the user must hear about)
and speaks inline only for the explicit Settings ask.

### Out of Scope

- Auto-download / auto-install (unsigned friction; revisit at 1.0
  with the dev account).
- The library activity log (the notice migrates there when that
  surface exists).
- Release-notes rendering in-app (the browser page serves).
- Linux tray (AppImage tray support is a swamp; the launch check +
  Settings row still work there).

### Design/Approach

Main process owns everything (renderer stays offline-pure): an
`update-check.ts` module fetches releases/latest with a short
timeout, compares the tag semver against `app.getVersion()`, and
caches the verdict for the session. Launch check runs after the
window shows (never blocks startup). Tray via Electron's `Tray` +
`Menu`: idle state uses the app glyph, update state swaps to a
badged glyph + tooltip "v0.25.0 available"; menu rows: "Download
v0.25.0" (shell.openExternal to the platform asset / release
page), "Check for updates", "Open Expanding Worlds" (focus), no
Quit row duplication beyond the platform default. Settings gains
one row in the About cluster: current version, "Check for
updates" Button, inline result sentence (GR-1 quiet-sentence
form: checking… / up to date / "v0.25.0 is out — download").
IPC: one `update:check` invoke + one `update:status` push. Asset
pick by platform: dmg (darwin), exe (win32), AppImage (linux).
Tray icon assets from the shipped app icon (16px template image
on macOS for menu-bar rendering).

### Files to Touch

- `apps/desktop/src/main/update-check.ts` (new: fetch, semver
  compare, session cache).
- `apps/desktop/src/main/tray.ts` (new: Tray + menu + badge
  swap).
- `apps/desktop/src/main/index.ts` (wire launch check + tray
  creation + IPC).
- `apps/desktop/src/preload` (expose `update:check`/status).
- `apps/desktop/src/renderer/views/SettingsView.svelte` (the
  About-cluster row).
- Icon assets for the tray (derived from app-icon; macOS
  template variant).
- Unit tests for the semver compare + asset pick; e2e is
  structurally blind to tray (HUMAN-TESTING carries the close).
- `CHANGELOG.md`, `RAG/HUMAN-TESTING.md`.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [x] update-check module: fetch + compare + cache; silent on
      launch failure; unit-tested (15 cases: compare table,
      per-platform asset pick + fallback, update/current/error/
      offline verdicts).
- [x] Tray on win32 + darwin: idle/update states, tooltip, menu
      rows wired; darwin uses a template image + • title for the
      update state (rendering is HUMAN-TESTING's close — trays are
      structurally invisible to e2e).
- [x] Launch check 3s after ready, gated to packaged builds
      (a dev tree is not a stale install); failure path silent by
      construction (unit-tested error verdict + caught timer).
- [x] Settings row: version + check button + inline sentence
      (checking / up-to-date / update with download / error, GR-1
      form) + a teaching idle line.
- [x] Download opens the platform asset (fallback: release page)
      via a NARROW door — main only ever opens the last verdict's
      URL, never a renderer-supplied one.
- [x] Full `CI=true pnpm check` green (units incl. +15, lint,
      spike, e2e 255 passed / 1 pre-existing source-panel flake
      passed-on-retry); HUMAN-TESTING entries both platforms;
      CHANGELOG under [Unreleased].

### Acceptance Criteria

**GIVEN** a running build older than the latest GitHub release
**WHEN** the app launches with network available
**THEN** the tray icon shows the update state with a tooltip
naming the version, its menu offers "Download vX.Y.Z", and no
modal or toast interrupts the board

**GIVEN** the same stale build with no network
**WHEN** it launches
**THEN** nothing is shown and nothing blocks or delays startup

**GIVEN** Settings → Check for updates
**WHEN** clicked
**THEN** the row prints checking…, then either "up to date" or
the available version with a download affordance, inline

**GIVEN** the tray menu's download row
**WHEN** activated
**THEN** the default browser opens the platform-correct asset or
the release page.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->

Lead-built parallel to the trust-wave setup (main/ fenced from
Codex for exactly this reason). Deviations from ticket text, all
small: no separate `update:status` pull was needed in Settings —
it pulls `update:status-current` on mount and renders push-free;
tray glyphs are GENERATED assets (PIL from build/icon.png: black-
alpha template for the mac menu bar, amber-dot badge variant for
win32) committed under resources/icons/tray and shipped via
extraResources; macOS signals updates with • setTitle rather than
an image swap (template-image convention). The renderer cannot
open arbitrary URLs: `update:open-download` only opens what the
last check produced. Tray + launch check are gated off under
EW_TEST_HIDDEN_WINDOWS so e2e never spawns trays or touches the
network. Tray look/feel on both platforms is human-close;
the first real proof arrives free with the next tag — v0.24.0
installs should show the v0.25.0 notice.
