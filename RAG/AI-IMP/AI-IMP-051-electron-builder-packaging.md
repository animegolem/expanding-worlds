---
node_id: AI-IMP-051
tags:
  - IMP-LIST
  - Implementation
  - infrastructure
  - packaging
kanban_status: planned
depends_on: [AI-IMP-050]
parent_epic: [[AI-EPIC-011-release-engineering]]
confidence_score: 0.75
date_created: 2026-07-05
date_completed:
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

- [ ] Runtime deps moved to devDependencies; dev session, full
      build, and e2e all still green (vite resolves deps regardless
      of dep type).
- [ ] electron-builder.yml with the three targets; `npmRebuild:
      false`; artifacts land in an ignored directory.
- [ ] `pnpm dist` builds an unsigned arm64 DMG locally.
- [ ] Packaged app smoke-tested from the DMG mount: launches,
      default project opens, image import + draw + note editing
      work, relaunch reopens the same project.
- [ ] Version 0.5.0; gates green.

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
