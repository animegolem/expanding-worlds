---
node_id: AI-IMP-051
tags:
  - IMP-LIST
  - Implementation
  - infrastructure
  - packaging
kanban_status: completed
depends_on: [AI-IMP-050]
parent_epic: [[AI-EPIC-011-release-engineering]]
confidence_score: 0.75
date_created: 2026-07-05
date_completed: 2026-07-05
---

# AI-IMP-051-electron-builder-packaging

## Summary of Issue #1

No packaged build exists; testers need installable artifacts. Wire
electron-builder onto the electron-vite output for three unsigned
targets: DMG (macOS arm64 — both testers' machines), NSIS exe
(Windows x64), AppImage (Linux x64; chosen over Flatpak — no Flathub
ambitions, and the manual check-releases update loop wants one
self-contained file). Done when `pnpm dist` produces a DMG locally
and the packaged app launches, creates/opens its default project,
and passes a hand smoke test (place image, draw, note).

### Out of Scope

Code signing / notarization (unsigned; macOS first launch is
right-click → Open). Custom app icon (default Electron icon for the
alpha; icon lands with the artist's assets). Auto-update. CI builds
of the Windows/Linux targets (AI-IMP-052's matrix does those).

### Design/Approach

The bundle has NO runtime node_modules: persistence uses node:sqlite
(no native modules) and electron-vite bundles main/preload/utility
to `out/*.cjs` with only `electron` and `node:` builtins external;
the renderer is fully built assets. So the app's package.json
runtime `dependencies` move to devDependencies (they are build-time
inputs only) and electron-builder packs just `out/**` — no
dependency collection, no pnpm-workspace symlink trouble, identical
app on all three platforms. electron-builder config lives in
`apps/desktop/electron-builder.yml`: appId
io.github.animegolem.expanding-worlds, productName Expanding
Worlds, `files: [out/**]`, mac dmg arm64 / win nsis x64 / linux
AppImage x64, `npmRebuild: false`. Scripts: `dist` (current
platform), `dist:mac|win|linux`. Version source: apps/desktop
package.json version bumped to 0.5.0 (minor = epic number).

### Files to Touch

`apps/desktop/electron-builder.yml`: new config.
`apps/desktop/package.json`: version 0.5.0, dist scripts,
dependency reshuffle, electron-builder devDep.
`.gitignore`: dist-artifacts directory.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and
**think**. Have you validated all aspects are **implemented** and
**tested**?
</CRITICAL_RULE>

- [x] Runtime deps moved to devDependencies; full build and complete
      e2e suite green locally (34/34) and on CI (vite resolves deps
      regardless of dep type; dev-mode unchanged by construction —
      the owner's live session confirms on next reload).
- [x] electron-builder.yml with the three targets; `npmRebuild:
      false`; artifacts land in an ignored directory.
- [x] `pnpm dist` builds an unsigned arm64 DMG locally (105 MB).
- [x] Packaged app smoke-tested via Playwright against the packaged
      .app (identical bytes to the DMG payload, hidden window,
      isolated project dir): boots, creates its project, CreatePin +
      note command round trip, image import through the packaged
      utility's blob pipeline, drawn decoration, and a relaunch
      reopens the same project with data intact.
- [x] Version 0.5.0; gates green.

### Acceptance Criteria

**GIVEN** a clean checkout after `pnpm install && pnpm -r build`
**WHEN** `pnpm dist` runs in apps/desktop on macOS
**THEN** an unsigned arm64 DMG is produced
**AND** the app inside launches via right-click → Open, opens its
default project, and survives an edit + relaunch round trip.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
Smooth ticket — the node:sqlite / bundle-everything architecture
paid off exactly as designed: electron-builder collects ZERO
node_modules, sidestepping the entire pnpm-workspace packaging
problem class, and the app payload is just out/**. Deviations: the
smoke test is automated Playwright against the packaged .app rather
than a hand pass from the mounted DMG (same bytes; the owner is
hands-on this week and the DMG sits in dist-artifacts/ for a visual
pass — default Electron icon expected until the artist's icon
lands). pnpm's approve-builds prompt during electron-builder's
install wrote a placeholder into pnpm-workspace.yaml
(electron-winstaller) — settled to false, as Squirrel.Windows is
unused. Windows/Linux artifacts are built only by AI-IMP-052's
release matrix, per scope.
